import json
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.dependencies import WorkspaceContext
from app.core.models import (
    AgentApproval,
    AgentConversation,
    AgentExecution,
    AgentMessage,
    utcnow,
)
from app.core.secrets import decrypt_secret, encrypt_secret, mask_secret
from app.modules.agent.gateway import AgentPlan, ModelGateway, ToolCall
from app.modules.agent.registry import get_tool
from app.modules.agent.tools import execute_tool
from app.modules.workspaces.onboarding_router import (
    ConfirmRequest,
    ResolveExecutionRequest,
    confirm_step,
    normalize_state,
    resolve_onboarding_execution,
)

MAX_MESSAGE_LENGTH = 2000
MAX_MODEL_STEPS = 5
WRITE_ROLES = {"owner", "admin", "platform_admin"}
ONBOARDING_STEPS = ("profile", "site", "leads")
RETRY_SAFE_TOOLS = {
    "product_update",
    "product_update_sku",
    "product_adjust_stock",
    "config_update_profile",
    "config_update_shopify",
    "config_toggle_shopify",
    "onboarding_save_step_draft",
    "onboarding_apply_card",
    "onboarding_cancel_card",
    "onboarding_confirm_step",
    "onboarding_pause",
    "onboarding_continue",
    "onboarding_restart",
    "onboarding_finish",
    "onboarding_back_step",
}
logger = logging.getLogger("mekyro.agent")


@dataclass
class ToolRunState:
    completed: bool = False
    should_continue: bool = False
    tool_call_id: str = ""


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _public_error(code: str, message: str, *, retryable: bool = False) -> str:
    return sse("error", {"code": code, "message": message, "retryable": retryable})


def _redact_arguments(name: str, arguments: dict) -> dict:
    public = {
        key: value
        for key, value in arguments.items()
        if key not in {"api_key_encrypted", "api_secret_key_encrypted"}
    }
    for key in ("api_key_encrypted", "api_secret_key_encrypted"):
        if key in arguments:
            public[key.removesuffix("_encrypted") + "_configured"] = True
    for key in ("api_key", "api_secret_key", "shopify_api_key", "shopify_api_secret_key"):
        if key in public:
            public[key] = mask_secret(str(public[key]))
    if name == "product_import" and "rows" in public:
        public["rows"] = {"count": len(public.get("rows") or [])}
    return public


def _protect_arguments(name: str, arguments: dict, settings: Settings) -> dict:
    protected = dict(arguments)
    if name == "config_update_shopify":
        for key in ("api_key", "api_secret_key"):
            if key in protected:
                protected[f"{key}_encrypted"] = encrypt_secret(str(protected.pop(key)), settings)
    return protected


def _unprotect_arguments(name: str, arguments: dict, settings: Settings) -> dict:
    plain = dict(arguments)
    if name == "config_update_shopify":
        for key in ("api_key", "api_secret_key"):
            encrypted_key = f"{key}_encrypted"
            if encrypted_key in plain:
                plain[key] = decrypt_secret(str(plain.pop(encrypted_key)), settings)
    return plain


async def _conversation(
    *,
    conversation_id: str | None,
    message: str,
    context: WorkspaceContext,
    session: AsyncSession,
) -> AgentConversation:
    item = None
    if conversation_id:
        item = await session.scalar(
            select(AgentConversation).where(
                AgentConversation.id == conversation_id,
                AgentConversation.workspace_id == context.workspace.id,
                AgentConversation.user_id == context.user.id,
                AgentConversation.status.in_({"active", "onboarding"}),
            )
        )
        if item is None:
            raise HTTPException(status_code=404, detail="Agent conversation not found")
    if item is None:
        item = AgentConversation(
            workspace_id=context.workspace.id,
            user_id=context.user.id,
            title=(message[:80] if message else "Agent conversation"),
        )
        session.add(item)
        await session.flush()
    return item


async def _history(conversation_id: str, session: AsyncSession) -> list[dict]:
    rows = (
        await session.scalars(
            select(AgentMessage)
            .where(AgentMessage.conversation_id == conversation_id)
            .order_by(AgentMessage.created_at.desc())
            .limit(20)
        )
    ).all()
    history = []
    known_tool_call_ids: set[str] = set()
    for item in reversed(rows):
        entry = {"role": item.role, "content": item.content}
        if item.role == "assistant" and item.event_type == "model_plan":
            tool_calls = item.event_payload.get("tool_calls") or []
            if tool_calls:
                entry["tool_calls"] = tool_calls
                known_tool_call_ids.update(str(call.get("id") or "") for call in tool_calls)
        elif item.role == "tool" and item.event_type == "tool_result":
            tool_call_id = item.event_payload.get("tool_call_id")
            if not tool_call_id or str(tool_call_id) not in known_tool_call_ids:
                continue
            entry["tool_call_id"] = tool_call_id
        history.append(entry)
    return history


def _store_event(
    session: AsyncSession,
    conversation_id: str,
    *,
    role: str,
    event_type: str,
    content: str = "",
    payload: dict | None = None,
) -> None:
    session.add(
        AgentMessage(
            conversation_id=conversation_id,
            role=role,
            content=content,
            event_type=event_type,
            event_payload=payload or {},
        )
    )


def _normalized_plan(plan: AgentPlan) -> AgentPlan:
    return AgentPlan(
        text=plan.text,
        tool_calls=tuple(
            ToolCall(
                name=call.name,
                arguments=call.arguments,
                execution_key=call.execution_key or f"call_{uuid4().hex}",
            )
            for call in plan.tool_calls
        ),
    )


def _store_model_plan(
    session: AsyncSession,
    conversation_id: str,
    plan: AgentPlan,
) -> None:
    tool_calls = [
        {
            "id": call.execution_key,
            "type": "function",
            "function": {
                "name": call.name,
                "arguments": json.dumps(
                    _redact_arguments(call.name, call.arguments),
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            },
        }
        for call in plan.tool_calls
    ]
    _store_event(
        session,
        conversation_id,
        role="assistant",
        event_type="model_plan",
        content=plan.text,
        payload={"tool_calls": tool_calls},
    )


def _store_tool_result(
    session: AsyncSession,
    conversation_id: str,
    *,
    tool: str,
    tool_call_id: str,
    execution_id: str,
    result: dict,
) -> None:
    _store_event(
        session,
        conversation_id,
        role="tool",
        event_type="tool_result",
        content=json.dumps(result, ensure_ascii=False, separators=(",", ":")),
        payload={
            "tool": tool,
            "tool_call_id": tool_call_id,
            "execution_id": execution_id,
            "result": result,
        },
    )


def _execution_key(conversation_id: str, call: ToolCall) -> str:
    return call.execution_key or f"agent:{conversation_id}:{uuid4().hex}"


def _approval_card(approval: AgentApproval, execution: AgentExecution) -> dict:
    return {
        "approval_id": approval.id,
        "execution_id": execution.id,
        "execution_key": execution.execution_key,
        "tool": execution.tool_name,
        "summary": approval.summary,
        "input": _redact_arguments(execution.tool_name, execution.tool_input),
        "status": approval.status,
        "expires_at": approval.expires_at.isoformat(),
        "actions": [
            {"type": "approve_agent_execution", "label": "确认", "variant": "primary"},
            {"type": "reject_agent_execution", "label": "取消", "variant": "secondary"},
        ],
    }


def _approval_expired(approval: AgentApproval) -> bool:
    expires_at = approval.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at <= utcnow()


async def _new_execution(
    *,
    conversation: AgentConversation,
    call: ToolCall,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
    status: str,
) -> tuple[AgentExecution, bool]:
    key = _execution_key(conversation.id, call)
    existing = await session.scalar(
        select(AgentExecution).where(
            AgentExecution.workspace_id == context.workspace.id,
            AgentExecution.execution_key == key,
        )
    )
    if existing is not None:
        return existing, True
    execution = AgentExecution(
        workspace_id=context.workspace.id,
        conversation_id=conversation.id,
        requested_by=context.user.id,
        execution_key=key,
        tool_name=call.name,
        tool_input=_protect_arguments(call.name, call.arguments, settings),
        status=status,
    )
    session.add(execution)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(AgentExecution).where(
                AgentExecution.workspace_id == context.workspace.id,
                AgentExecution.execution_key == key,
            )
        )
        if existing is None:
            raise
        return existing, True
    return execution, False


async def _run_execution(
    execution: AgentExecution,
    *,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
) -> dict:
    execution_id = execution.id
    execution.status = "running"
    execution.attempt_count += 1
    execution.error_code = ""
    await session.commit()
    try:
        result = await execute_tool(
            name=execution.tool_name,
            arguments=_unprotect_arguments(execution.tool_name, execution.tool_input, settings),
            context=context,
            session=session,
            settings=settings,
            execution_key=execution.execution_key,
        )
    except HTTPException:
        await session.rollback()
        refreshed = await session.get(AgentExecution, execution_id)
        if refreshed is not None:
            refreshed.status = "failed"
            refreshed.error_code = "TOOL_VALIDATION_FAILED"
            await session.commit()
        raise
    except Exception:
        await session.rollback()
        refreshed = await session.get(AgentExecution, execution_id)
        if refreshed is not None:
            refreshed.status = "result_unknown"
            refreshed.error_code = "TOOL_RESULT_UNKNOWN"
            await session.commit()
        raise
    refreshed = await session.get(AgentExecution, execution_id)
    if refreshed is None:
        raise RuntimeError("Agent execution disappeared")
    refreshed.status = "succeeded"
    refreshed.result_payload = result
    refreshed.error_code = ""
    await session.commit()
    return result


async def _run_call(
    call: ToolCall,
    *,
    conversation: AgentConversation,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
    state: ToolRunState | None = None,
    record_history: bool = False,
) -> AsyncIterator[str]:
    state = state or ToolRunState()
    state.tool_call_id = call.execution_key or ""
    spec = get_tool(call.name)
    if spec is None:
        yield _public_error("TOOL_NOT_FOUND", "请求的工具不存在。")
        return
    public_input = _redact_arguments(call.name, call.arguments)
    yield sse("tool_call", {"tool": call.name, "input": public_input})
    if spec.writes:
        if context.role not in WRITE_ROLES:
            yield _public_error("WORKSPACE_WRITE_DENIED", "当前成员没有写入权限。")
            return
        execution, replay = await _new_execution(
            conversation=conversation,
            call=call,
            context=context,
            session=session,
            settings=settings,
            status="pending_approval",
        )
        if replay:
            if execution.status == "succeeded":
                if record_history:
                    _store_tool_result(
                        session,
                        conversation.id,
                        tool=execution.tool_name,
                        tool_call_id=call.execution_key or execution.execution_key,
                        execution_id=execution.id,
                        result=execution.result_payload,
                    )
                    await session.commit()
                state.completed = True
                state.should_continue = True
                state.tool_call_id = call.execution_key or execution.execution_key
                yield sse(
                    "tool_result",
                    {
                        "tool": execution.tool_name,
                        "result": execution.result_payload,
                        "replayed": True,
                    },
                )
                return
            approval = await session.scalar(
                select(AgentApproval).where(AgentApproval.execution_id == execution.id)
            )
            if approval is not None:
                yield sse("approval_card", _approval_card(approval, execution))
                return
            yield _public_error("EXECUTION_STATE_CONFLICT", "执行状态暂时不可用。", retryable=True)
            return
        approval = AgentApproval(
            workspace_id=context.workspace.id,
            execution_id=execution.id,
            requested_by=context.user.id,
            status="pending",
            summary=spec.description,
            expires_at=utcnow() + timedelta(minutes=30),
        )
        session.add(approval)
        _store_event(
            session,
            conversation.id,
            role="assistant",
            event_type="approval_card",
            payload={"approval_id": approval.id, "execution_id": execution.id, "tool": call.name},
        )
        await session.commit()
        yield sse("approval_card", _approval_card(approval, execution))
        return
    execution, replay = await _new_execution(
        conversation=conversation,
        call=call,
        context=context,
        session=session,
        settings=settings,
        status="running",
    )
    execution_id = execution.id
    if replay and execution.status == "succeeded":
        if record_history:
            _store_tool_result(
                session,
                conversation.id,
                tool=execution.tool_name,
                tool_call_id=call.execution_key or execution.execution_key,
                execution_id=execution.id,
                result=execution.result_payload,
            )
            await session.commit()
        state.completed = True
        state.should_continue = True
        state.tool_call_id = call.execution_key or execution.execution_key
        yield sse(
            "tool_result",
            {"tool": execution.tool_name, "result": execution.result_payload, "replayed": True},
        )
        return
    try:
        result = await _run_execution(
            execution, context=context, session=session, settings=settings
        )
    except HTTPException:
        yield _public_error("TOOL_VALIDATION_FAILED", "工具请求未通过业务校验。")
        return
    except Exception:
        yield sse(
            "error",
            {
                "code": "TOOL_RESULT_UNKNOWN",
                "message": "执行结果无法确认，请先核对业务数据。",
                "retryable": True,
                "execution_id": execution_id,
            },
        )
        return
    if record_history:
        _store_tool_result(
            session,
            conversation.id,
            tool=call.name,
            tool_call_id=call.execution_key or execution.execution_key,
            execution_id=execution.id,
            result=result,
        )
        await session.commit()
    state.completed = True
    state.should_continue = True
    state.tool_call_id = call.execution_key or execution.execution_key
    yield sse("tool_result", {"tool": call.name, "result": result})


def _model_plan_ready(history: list[dict], tool_call_id: str) -> bool:
    for index in range(len(history) - 1, -1, -1):
        item = history[index]
        calls = item.get("tool_calls") or []
        call_ids = {str(call.get("id") or "") for call in calls}
        if tool_call_id not in call_ids:
            continue
        completed_ids = {
            str(entry.get("tool_call_id") or "")
            for entry in history[index + 1 :]
            if entry.get("role") == "tool"
        }
        return bool(call_ids) and call_ids <= completed_ids
    return False


def _model_call_known(history: list[dict], tool_call_id: str) -> bool:
    return any(
        tool_call_id == str(call.get("id") or "")
        for item in history
        for call in item.get("tool_calls") or []
    )


async def _model_loop(
    *,
    message: str,
    conversation: AgentConversation,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
    gateway: ModelGateway,
) -> AsyncIterator[str]:
    next_message = message
    for _step in range(MAX_MODEL_STEPS):
        history = await _history(conversation.id, session)
        plan = _normalized_plan(await gateway.plan(message=next_message, history=history))
        if not plan.text and not plan.tool_calls:
            return
        _store_model_plan(session, conversation.id, plan)
        await session.commit()
        # Tool-call preambles such as "let me check" add noise. Keep the UI in its
        # thinking state until the model has the real tool result to summarize.
        if plan.text and not plan.tool_calls:
            yield sse("text", {"text": plan.text})
        if not plan.tool_calls:
            return

        all_completed = True
        for call in plan.tool_calls:
            state = ToolRunState()
            async for event in _run_call(
                call,
                conversation=conversation,
                context=context,
                session=session,
                settings=settings,
                state=state,
                record_history=True,
            ):
                yield event
            all_completed = all_completed and state.completed
        if not all_completed:
            return
        next_message = ""
    yield _public_error(
        "AGENT_STEP_LIMIT",
        "Agent 工具调用轮次过多，请缩小请求范围后重试。",
    )


async def _approval_action(
    action: dict,
    *,
    conversation: AgentConversation,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
    state: ToolRunState | None = None,
) -> AsyncIterator[str]:
    state = state or ToolRunState()
    approval_id = str(action.get("approval_id") or "")
    approval = await session.scalar(
        select(AgentApproval).where(
            AgentApproval.id == approval_id,
            AgentApproval.workspace_id == context.workspace.id,
        )
    )
    if approval is None:
        yield _public_error("APPROVAL_NOT_FOUND", "审批记录不存在。")
        return
    execution = await session.get(AgentExecution, approval.execution_id)
    if execution is None or execution.conversation_id != conversation.id:
        yield _public_error("APPROVAL_NOT_FOUND", "审批记录不存在。")
        return
    supplied_key = action.get("execution_key")
    if supplied_key and supplied_key != execution.execution_key:
        yield _public_error("EXECUTION_KEY_MISMATCH", "执行标识不匹配。")
        return
    record_history = _model_call_known(
        await _history(conversation.id, session), execution.execution_key
    )
    if action.get("type") == "reject_agent_execution":
        newly_rejected = approval.status == "pending"
        if approval.status == "pending":
            approval.status = "rejected"
            approval.decided_by = context.user.id
            approval.decided_at = utcnow()
            execution.status = "cancelled"
            await session.commit()
        result = {"cancelled": True}
        if newly_rejected and record_history:
            _store_tool_result(
                session,
                conversation.id,
                tool=execution.tool_name,
                tool_call_id=execution.execution_key,
                execution_id=execution.id,
                result=result,
            )
            await session.commit()
        if newly_rejected:
            state.completed = True
            state.should_continue = True
            state.tool_call_id = execution.execution_key
        yield sse(
            "tool_result",
            {
                "tool": execution.tool_name,
                "result": result,
                "replayed": not newly_rejected,
            },
        )
        return
    if context.role not in WRITE_ROLES:
        yield _public_error("WORKSPACE_WRITE_DENIED", "当前成员没有写入权限。")
        return
    if approval.status == "pending" and _approval_expired(approval):
        approval.status = "expired"
        execution.status = "cancelled"
        await session.commit()
        yield _public_error("APPROVAL_EXPIRED", "审批已过期，请重新发起。")
        return
    if execution.status == "succeeded":
        yield sse(
            "tool_result",
            {"tool": execution.tool_name, "result": execution.result_payload, "replayed": True},
        )
        return
    if execution.status in {"running", "result_unknown"}:
        yield _public_error(
            "EXECUTION_RESULT_UNKNOWN"
            if execution.status == "result_unknown"
            else "EXECUTION_IN_PROGRESS",
            "执行结果尚未确定，请先核对业务数据。",
            retryable=True,
        )
        return
    if approval.status not in {"pending", "approved"}:
        yield _public_error("APPROVAL_NOT_PENDING", "审批已结束，不能再执行。")
        return
    approval.status = "approved"
    approval.decided_by = context.user.id
    approval.decided_at = utcnow()
    execution.status = "running"
    await session.commit()
    yield sse("status", {"state": "executing", "execution_id": execution.id})
    try:
        result = await _run_execution(
            execution, context=context, session=session, settings=settings
        )
    except HTTPException:
        yield _public_error("TOOL_VALIDATION_FAILED", "写操作未通过业务校验。")
        return
    except Exception:
        yield _public_error(
            "TOOL_RESULT_UNKNOWN",
            "执行结果无法确认，请先核对业务数据。",
            retryable=True,
        )
        return
    if record_history:
        _store_tool_result(
            session,
            conversation.id,
            tool=execution.tool_name,
            tool_call_id=execution.execution_key,
            execution_id=execution.id,
            result=result,
        )
        await session.commit()
    state.completed = True
    state.should_continue = True
    state.tool_call_id = execution.execution_key
    yield sse("tool_result", {"tool": execution.tool_name, "result": result})


async def _resolve_execution_action(
    action: dict,
    *,
    conversation: AgentConversation,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
) -> AsyncIterator[str]:
    execution_id = str(action.get("execution_id") or "")
    execution = await session.scalar(
        select(AgentExecution).where(
            AgentExecution.id == execution_id,
            AgentExecution.workspace_id == context.workspace.id,
            AgentExecution.conversation_id == conversation.id,
        )
    )
    if execution is None:
        yield _public_error("EXECUTION_NOT_FOUND", "执行记录不存在。")
        return
    if context.role not in WRITE_ROLES:
        yield _public_error("WORKSPACE_WRITE_DENIED", "当前成员没有写入权限。")
        return
    if action.get("confirmed") is not True:
        yield _public_error("CONFIRMATION_REQUIRED", "需要 confirmed=true 才能处理不确定结果。")
        return
    if execution.status == "succeeded":
        yield sse(
            "tool_result",
            {"tool": execution.tool_name, "result": execution.result_payload, "replayed": True},
        )
        return
    if execution.status != "result_unknown":
        yield _public_error("EXECUTION_NOT_UNCERTAIN", "只能处理结果不确定的执行。")
        return
    resolution = action.get("resolution")
    if resolution == "mark_succeeded":
        execution.status = "succeeded"
        execution.error_code = ""
        execution.result_payload = {
            "reconciled": True,
            "note": str(action.get("note") or "Business result verified by operator")[:500],
        }
        await session.commit()
        yield sse("tool_result", {"tool": execution.tool_name, "result": execution.result_payload})
        return
    if resolution == "mark_failed":
        execution.status = "failed"
        execution.error_code = "TOOL_RECONCILED_FAILED"
        await session.commit()
        yield sse("tool_result", {"tool": execution.tool_name, "result": {"failed": True}})
        return
    if resolution != "retry":
        yield _public_error("INVALID_RESOLUTION", "不支持的执行处理方式。")
        return
    if execution.tool_name not in RETRY_SAFE_TOOLS:
        yield _public_error(
            "EXECUTION_RETRY_UNSAFE",
            "该操作不能自动重试，请核对业务数据后手工标记。",
        )
        return
    yield sse("status", {"state": "retrying", "execution_id": execution.id})
    try:
        result = await _run_execution(
            execution, context=context, session=session, settings=settings
        )
    except HTTPException:
        yield _public_error("TOOL_VALIDATION_FAILED", "重试未通过业务校验。")
        return
    except Exception:
        yield _public_error("TOOL_RESULT_UNKNOWN", "重试结果仍无法确认。", retryable=True)
        return
    yield sse("tool_result", {"tool": execution.tool_name, "result": result})


def _onboarding_context(context: WorkspaceContext) -> dict:
    state = normalize_state(context.workspace.onboarding_state)
    current_step = state["current_step"]
    current_step_state = state["steps"].get(current_step, {})
    return {
        "workspace_id": context.workspace.id,
        "workspace_name": context.workspace.name,
        "workspaces": [
            {
                "workspace_id": context.workspace.id,
                "workspace_name": context.workspace.name,
            }
        ],
        "status": state["status"],
        "current_step": current_step,
        "completed_steps": [
            step for step in ONBOARDING_STEPS if state["steps"][step]["status"] == "confirmed"
        ],
        "step_statuses": {step: state["steps"][step]["status"] for step in ONBOARDING_STEPS},
        "execution": current_step_state.get("execution"),
        "completion_acknowledged": state["completion_acknowledged"],
    }


def _onboarding_prompt(state: dict) -> str:
    step = state.get("current_step")
    if state.get("status") == "not_started":
        return (
            "欢迎使用 Mekyro。为了让 AI 助理更准确地理解你的业务，"
            "接下来会用三个简短步骤完成初始化：企业资料、网站信息和获客需求。\n\n"
            "先从企业资料开始，请填写企业名称和企业介绍。所有信息都会先由你确认，再正式保存。"
        )
    prompts = {
        "profile": "请填写企业名称和企业介绍。信息整理完成后，我会生成确认内容供你检查。",
        "site": "企业资料已经确认。接下来请选择网站类型，并填写对应的网站信息。",
        "leads": (
            "最后，请填写目标行业、客户类型、目标国家或地区以及希望推广的产品。"
            "我会把这些内容整理成获客需求供你确认。"
        ),
    }
    return prompts.get(str(step), "入驻信息已经完成，你可以继续使用 AI 助理。")


def _public_onboarding_card(card: dict, execution: dict | None = None) -> dict:
    public = {key: value for key, value in card.items() if key != "operation"}
    execution_status = str((execution or {}).get("status") or "")
    if execution_status == "result_unknown":
        public["status"] = "result_unknown"
        public["actions"] = [
            {
                "type": "resolve_onboarding_execution",
                "label": "已确认写入，继续",
                "variant": "primary",
                "step": card.get("step"),
                "card_id": card.get("card_id"),
                "resolution": "mark_applied",
                "confirmed": True,
            },
            {
                "type": "resolve_onboarding_execution",
                "label": "确认未写入，重新执行",
                "variant": "secondary",
                "step": card.get("step"),
                "card_id": card.get("card_id"),
                "resolution": "retry",
                "confirmed": True,
            },
        ]
        return public
    if execution_status == "processing":
        public["status"] = "processing"
        public["actions"] = []
        return public
    public["actions"] = [
        {
            "type": "confirm_onboarding_card",
            "label": "确认",
            "variant": "primary",
            "step": card.get("step"),
            "card_id": card.get("card_id"),
        },
        {
            "type": "cancel_onboarding_card",
            "label": "取消",
            "variant": "secondary",
            "step": card.get("step"),
            "card_id": card.get("card_id"),
        },
    ]
    return public


async def _run_onboarding_direct(
    name: str,
    arguments: dict,
    *,
    conversation: AgentConversation,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
) -> tuple[dict | None, str | None]:
    arguments = dict(arguments)
    call = ToolCall(
        name=name,
        arguments=arguments,
        execution_key=str(arguments.pop("execution_key", "")) or None,
    )
    execution, replay = await _new_execution(
        conversation=conversation,
        call=call,
        context=context,
        session=session,
        settings=settings,
        status="running",
    )
    if replay:
        if execution.status == "succeeded":
            return execution.result_payload, None
        return None, "EXECUTION_IN_PROGRESS"
    try:
        return (
            await _run_execution(execution, context=context, session=session, settings=settings),
            None,
        )
    except HTTPException:
        return None, "ONBOARDING_VALIDATION_FAILED"
    except Exception:
        return None, "ONBOARDING_INTERNAL_ERROR"


async def _onboarding_action(
    action: dict,
    *,
    conversation: AgentConversation,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
) -> AsyncIterator[str]:
    action_type = str(action.get("type") or "")
    if context.role not in WRITE_ROLES and action_type not in {
        "resume_onboarding",
        "select_onboarding_workspace",
    }:
        yield _public_error("WORKSPACE_WRITE_DENIED", "当前成员没有写入权限。")
        return
    if action_type == "resolve_onboarding_execution":
        card_id = str(action.get("card_id") or "")
        step = str(action.get("step") or "")
        state = normalize_state(context.workspace.onboarding_state)
        if not step:
            step = next(
                (
                    name
                    for name in ONBOARDING_STEPS
                    if ((state["steps"][name].get("pending_card") or {}).get("card_id"))
                    == card_id
                ),
                "",
            )
        state_execution = (state["steps"].get(step) or {}).get("execution")
        if isinstance(state_execution, dict) and state_execution.get("card_id") == card_id:
            try:
                resolved = await resolve_onboarding_execution(
                    step,
                    card_id,
                    ResolveExecutionRequest(
                        resolution=str(action.get("resolution") or ""),
                        confirmed=action.get("confirmed") is True,
                    ),
                    context,
                    session,
                )
            except (HTTPException, ValueError):
                yield _public_error("ONBOARDING_VALIDATION_FAILED", "无法核对该入驻执行。")
                return
            if resolved.get("retry_ready"):
                state = normalize_state(context.workspace.onboarding_state)
                step_state = state["steps"][step]
                yield sse("onboarding_context", _onboarding_context(context))
                yield sse(
                    "onboarding_card",
                    _public_onboarding_card(step_state["pending_card"], step_state.get("execution")),
                )
                return
            try:
                result = await confirm_step(
                    step,
                    ConfirmRequest(confirmed=True),
                    context,
                    session,
                )
            except HTTPException:
                yield _public_error("ONBOARDING_STATE_CONFLICT", "执行已核对，但步骤确认失败。")
                return
            yield sse("onboarding_context", _onboarding_context(context))
            yield sse(
                "tool_result",
                {"tool": "onboarding_resolve_execution", "result": result},
            )
            return
        execution = await session.scalar(
            select(AgentExecution)
            .where(
                AgentExecution.workspace_id == context.workspace.id,
                AgentExecution.conversation_id == conversation.id,
                AgentExecution.execution_key.in_(
                    {
                        f"onboarding:{context.workspace.id}:{card_id}:apply",
                        f"onboarding:{context.workspace.id}:{card_id}:confirm",
                    }
                ),
                AgentExecution.status == "result_unknown",
            )
            .order_by(AgentExecution.created_at.desc())
        )
        if execution is None:
            yield _public_error("EXECUTION_NOT_FOUND", "没有需要核对的入驻执行。")
            return
        resolution = {
            "mark_applied": "mark_succeeded",
            "retry": "retry",
        }.get(str(action.get("resolution") or ""), "")
        async for item in _resolve_execution_action(
            {
                "execution_id": execution.id,
                "resolution": resolution,
                "confirmed": action.get("confirmed") is True,
            },
            conversation=conversation,
            context=context,
            session=session,
            settings=settings,
        ):
            yield item
        return
    if action_type in {"resume_onboarding", "select_onboarding_workspace"}:
        state = normalize_state(context.workspace.onboarding_state)
        if action_type == "resume_onboarding" and state["status"] == "not_started":
            previous_onboarding = await session.scalar(
                select(AgentConversation.id)
                .where(
                    AgentConversation.workspace_id == context.workspace.id,
                    AgentConversation.user_id == context.user.id,
                    AgentConversation.id != conversation.id,
                    AgentConversation.status == "onboarding",
                )
                .limit(1)
            )
            if previous_onboarding:
                paused_state, pause_error = await _run_onboarding_direct(
                    "onboarding_pause",
                    {},
                    conversation=conversation,
                    context=context,
                    session=session,
                    settings=settings,
                )
                if not pause_error and paused_state:
                    state = paused_state
        conversation.status = (
            "onboarding"
            if state["status"] in {"not_started", "in_progress"}
            else "active"
        )
        await session.commit()
        step_state = state["steps"].get(state["current_step"], {})
        pending = step_state.get("pending_card")
        requirement = str(
            state.get("lead_acquisition_requirement")
            or context.workspace.prompt
            or context.workspace.lead_acquisition_requirement
            or ""
        ).strip()
        if state["current_step"] == "leads" and not pending and requirement:
            restored, error = await _run_onboarding_direct(
                "onboarding_save_step_draft",
                {
                    "step": "leads",
                    "answers": {"requirement_description": requirement},
                },
                conversation=conversation,
                context=context,
                session=session,
                settings=settings,
            )
            if not error and restored:
                state = restored
                pending = state["steps"]["leads"].get("pending_card")
        yield sse("onboarding_context", _onboarding_context(context))
        if pending:
            yield sse(
                "onboarding_card",
                _public_onboarding_card(pending, step_state.get("execution")),
            )
        else:
            yield sse(
                "text",
                {
                    "text": _onboarding_prompt(state)
                    if state["status"] != "completed"
                    else "入驻信息已经完成。"
                },
            )
        return
    mapping = {
        "pause_onboarding": ("onboarding_pause", {}),
        "continue_onboarding": ("onboarding_continue", {}),
        "restart_onboarding": (
            "onboarding_restart",
            {"confirmed": action.get("confirmed") is True},
        ),
        "finish_onboarding": ("onboarding_finish", {"confirmed": action.get("confirmed") is True}),
        "back_onboarding_step": ("onboarding_back_step", {}),
        "cancel_onboarding_card": (
            "onboarding_cancel_card",
            {"step": action.get("step"), "card_id": action.get("card_id")},
        ),
        "save_onboarding_draft": (
            "onboarding_save_step_draft",
            {"step": action.get("step"), "answers": action.get("answers") or {}},
        ),
        "select_onboarding_site": (
            "onboarding_save_step_draft",
            {
                "step": "site",
                "answers": {
                    "site_type": action.get("site_type") or action.get("value") or "none",
                    "site_variant": action.get("site_variant"),
                    "vendure_url": action.get("vendure_url") or action.get("site_url") or "",
                    "site_url": action.get("site_url"),
                    "site_details": action.get("site_details"),
                    "shopify_store_url": action.get("shopify_store_url"),
                    "shopify_api_key": action.get("shopify_api_key"),
                    "shopify_api_secret_key": action.get("shopify_api_secret_key"),
                },
            },
        ),
    }
    if action_type == "confirm_onboarding_card":
        card_execution_prefix = f"onboarding:{context.workspace.id}:{action.get('card_id')}"
        applied, error = await _run_onboarding_direct(
            "onboarding_apply_card",
            {
                "step": action.get("step"),
                "card_id": action.get("card_id"),
                "shopify_store_url": action.get("shopify_store_url"),
                "shopify_api_key": action.get("shopify_api_key"),
                "shopify_api_secret_key": action.get("shopify_api_secret_key"),
                "execution_key": f"{card_execution_prefix}:apply",
            },
            conversation=conversation,
            context=context,
            session=session,
            settings=settings,
        )
        if error:
            yield _public_error(
                error, "入驻卡片无法确认。", retryable=error.endswith("INTERNAL_ERROR")
            )
            return
        result, error = await _run_onboarding_direct(
            "onboarding_confirm_step",
            {
                "step": action.get("step"),
                "confirmed": True,
                "execution_key": f"{card_execution_prefix}:confirm",
            },
            conversation=conversation,
            context=context,
            session=session,
            settings=settings,
        )
    elif action_type == "abandon_onboarding":
        result, error = await _run_onboarding_direct(
            "onboarding_restart",
            {"confirmed": action.get("confirmed") is True},
            conversation=conversation,
            context=context,
            session=session,
            settings=settings,
        )
        if not error:
            result, error = await _run_onboarding_direct(
                "onboarding_pause",
                {},
                conversation=conversation,
                context=context,
                session=session,
                settings=settings,
            )
        tool_name = "onboarding_pause"
    elif action_type in mapping:
        tool_name, arguments = mapping[action_type]
        result, error = await _run_onboarding_direct(
            tool_name,
            arguments,
            conversation=conversation,
            context=context,
            session=session,
            settings=settings,
        )
    else:
        if action_type == "finish_products_step":
            yield sse("text", {"text": "商品步骤已取消，请继续线索获取需求。"})
            return
        yield _public_error("ONBOARDING_ACTION_UNSUPPORTED", "不支持的入驻操作。")
        return
    if error:
        yield _public_error(error, "入驻操作未完成。", retryable=error.endswith("INTERNAL_ERROR"))
        return
    await session.refresh(context.workspace)
    state = normalize_state(context.workspace.onboarding_state)
    if (
        action_type == "finish_onboarding"
        and (result or {}).get("completion_acknowledged")
    ) or action_type == "abandon_onboarding" or state["status"] == "paused":
        conversation.status = "active"
    elif state["status"] in {"not_started", "in_progress"}:
        conversation.status = "onboarding"
    if conversation in session.dirty:
        await session.commit()
    yield sse("onboarding_context", _onboarding_context(context))
    pending = state["steps"].get(state["current_step"], {}).get("pending_card")
    if pending:
        current_step_state = state["steps"].get(state["current_step"], {})
        yield sse(
            "onboarding_card",
            _public_onboarding_card(pending, current_step_state.get("execution")),
        )
    yield sse(
        "tool_result",
        {
            "tool": tool_name
            if action_type != "confirm_onboarding_card"
            else "onboarding_confirm_step",
            "result": result,
        },
    )


_PROFILE_FIELD_PATTERN = re.compile(
    r"(?:企业|公司)(?:名称|名)\s*(?:是|为|[:：])\s*(?P<name>.+?)"
    r"(?:[，,；;。\n]+|\s+)"
    r"(?:企业|公司)(?:介绍|简介)\s*(?:是|为|[:：])\s*(?P<description>.+)",
    re.IGNORECASE | re.DOTALL,
)


def _parse_profile_answers(message: str) -> dict:
    text = message.strip()
    matched = _PROFILE_FIELD_PATTERN.fullmatch(text)
    if matched:
        name = matched.group("name").strip(" \t\r\n，,；;。")
        description = matched.group("description").strip(" \t\r\n，,；;。")
        return {"name": name, "description": description}

    natural_parts = re.split(r"[，,；;\n]+", text, maxsplit=1)
    if len(natural_parts) != 2:
        return {"name": "", "description": ""}
    name = natural_parts[0].strip(" \t\r\n，,；;。")
    description = natural_parts[1].strip(" \t\r\n，,；;。")
    return {"name": name, "description": description}


async def _natural_onboarding(
    message: str,
    *,
    conversation: AgentConversation,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
) -> AsyncIterator[str]:
    state = normalize_state(context.workspace.onboarding_state)
    normalized_message = " ".join(message.lower().split())
    if any(
        value in normalized_message for value in ("开始入驻", "继续入驻")
    ) or normalized_message in {
        "onboarding",
        "start onboarding",
        "resume onboarding",
    }:
        yield sse("onboarding_context", _onboarding_context(context))
        yield sse("text", {"text": _onboarding_prompt(state)})
        return
    if state["status"] not in {"in_progress", "not_started"}:
        return
    step = state["current_step"]
    if step == "profile":
        answers = _parse_profile_answers(message)
        if not answers["name"] or not answers["description"]:
            yield _public_error(
                "ONBOARDING_VALIDATION_FAILED",
                "请同时填写企业名称和企业介绍，例如：企业名称是示例科技，企业介绍是专注于消费电子产品出口。",
            )
            return
    elif step == "site":
        lowered = message.lower()
        site_type = (
            "shopify" if "shopify" in lowered else "independent" if "http" in lowered else "none"
        )
        url = next(
            (part for part in message.split() if part.startswith(("http://", "https://"))), ""
        )
        answers = {"site_type": site_type, "vendure_url": url}
    else:
        answers = {"requirement_description": message.strip()}
    result, error = await _run_onboarding_direct(
        "onboarding_save_step_draft",
        {"step": step, "answers": answers},
        conversation=conversation,
        context=context,
        session=session,
        settings=settings,
    )
    if error:
        yield _public_error(error, "入驻信息无法生成预览。")
        return
    card = result["steps"][step]["pending_card"]
    yield sse("onboarding_context", _onboarding_context(context))
    yield sse("text", {"text": "信息已整理为待确认卡片，确认后才会写入。"})
    yield sse("onboarding_card", _public_onboarding_card(card))


async def chat_stream(
    *,
    message: str,
    action: dict | None,
    conversation_id: str | None,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
    gateway: ModelGateway,
) -> AsyncIterator[str]:
    yield sse("status", {"state": "thinking"})
    try:
        conversation = await _conversation(
            conversation_id=conversation_id,
            message=message,
            context=context,
            session=session,
        )
    except HTTPException:
        yield _public_error("CONVERSATION_NOT_FOUND", "对话不存在。")
        return
    if message:
        _store_event(
            session,
            conversation.id,
            role="user",
            event_type="message",
            content=message,
        )
    await session.commit()
    current_conversation_id = conversation.id
    yield sse("conversation", {"conversation_id": current_conversation_id})
    try:
        action_type = str((action or {}).get("type") or "")
        if action_type in {"approve_agent_execution", "reject_agent_execution"}:
            approval_state = ToolRunState()
            async for event in _approval_action(
                action or {},
                conversation=conversation,
                context=context,
                session=session,
                settings=settings,
                state=approval_state,
            ):
                yield event
            if approval_state.should_continue:
                history = await _history(conversation.id, session)
                if _model_plan_ready(history, approval_state.tool_call_id):
                    async for event in _model_loop(
                        message="",
                        conversation=conversation,
                        context=context,
                        session=session,
                        settings=settings,
                        gateway=gateway,
                    ):
                        yield event
        elif action_type == "resolve_agent_execution":
            async for event in _resolve_execution_action(
                action or {},
                conversation=conversation,
                context=context,
                session=session,
                settings=settings,
            ):
                yield event
        elif action_type.startswith(
            (
                "resume_onboarding",
                "select_onboarding",
                "pause_onboarding",
                "continue_onboarding",
                "restart_onboarding",
                "finish_onboarding",
                "back_onboarding",
                "cancel_onboarding",
                "confirm_onboarding",
                "save_onboarding",
                "abandon_onboarding",
                "finish_products",
                "resolve_onboarding",
            )
        ):
            async for event in _onboarding_action(
                action or {},
                conversation=conversation,
                context=context,
                session=session,
                settings=settings,
            ):
                yield event
        elif action_type == "run_tool":
            call = ToolCall(
                name=str(action.get("tool") or ""),
                arguments=action.get("input") if isinstance(action.get("input"), dict) else {},
                execution_key=str(action.get("execution_key") or "") or None,
            )
            async for event in _run_call(
                call,
                conversation=conversation,
                context=context,
                session=session,
                settings=settings,
            ):
                yield event
        elif message:
            state = normalize_state(context.workspace.onboarding_state)
            onboarding_is_active = state["status"] in {"in_progress", "not_started"}
            if onboarding_is_active and (
                conversation.status == "onboarding"
                or any(value in message.lower() for value in ("入驻", "onboarding"))
            ):
                async for event in _natural_onboarding(
                    message,
                    conversation=conversation,
                    context=context,
                    session=session,
                    settings=settings,
                ):
                    yield event
            else:
                async for event in _model_loop(
                    message=message,
                    conversation=conversation,
                    context=context,
                    session=session,
                    settings=settings,
                    gateway=gateway,
                ):
                    yield event
        else:
            yield _public_error("EMPTY_REQUEST", "消息或操作不能为空。")
            return
    except Exception:
        logger.exception(
            "Agent stream failed workspace=%s conversation=%s action=%s",
            context.workspace.id,
            current_conversation_id,
            (action or {}).get("type"),
        )
        await session.rollback()
        yield _public_error(
            "AGENT_INTERNAL_ERROR", "Agent 暂时不可用，请稍后重试。", retryable=True
        )
        return
    yield sse("done", {"state": "complete", "conversation_id": current_conversation_id})
