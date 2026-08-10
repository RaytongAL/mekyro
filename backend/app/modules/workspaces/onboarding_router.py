import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified

from app.core.audit import record_audit
from app.core.config import get_settings
from app.core.dependencies import SessionDep, WorkspaceDep, WorkspaceWriteDep
from app.core.models import Lead, ShopifyConfig, Workspace, new_id
from app.core.secrets import encrypt_secret, mask_secret
from app.modules.shopify.client import clear_shopify_caches

router = APIRouter(prefix="/workspaces/{workspace_id}/onboarding", tags=["onboarding"])

OnboardingStep = Literal["profile", "site", "leads"]
STEPS: tuple[str, ...] = ("profile", "site", "leads")
LEGACY_STEPS: tuple[str, ...] = ("products",)
ONBOARDING_SCHEMA_VERSION = 5
MAX_REQUIREMENT_LENGTH = 2000
EXECUTION_UNKNOWN_AFTER_SECONDS = 10 * 60


class DraftRequest(BaseModel):
    answers: dict = Field(default_factory=dict)


class ConfirmRequest(BaseModel):
    confirmed: bool


class ApplyRequest(BaseModel):
    card_id: str = Field(min_length=8, max_length=100)
    shopify_store_url: str | None = Field(default=None, max_length=500)
    shopify_api_key: str | None = Field(default=None, max_length=200)
    shopify_api_secret_key: str | None = Field(default=None, max_length=200)


class ResolveExecutionRequest(BaseModel):
    resolution: Literal["mark_applied", "retry"]
    confirmed: bool


def _default_state() -> dict:
    return {
        "schema_version": ONBOARDING_SCHEMA_VERSION,
        "status": "not_started",
        "current_step": "profile",
        "lead_acquisition_requirement": "",
        "completion_acknowledged": False,
        "steps": {
            step: {
                "status": "pending",
                "answers": {},
                "pending_card": None,
                "execution": None,
                "applied_count": 0,
                "recent_applied_items": [],
            }
            for step in STEPS
        },
    }


def normalize_state(raw: dict | None) -> dict:
    state = _default_state()
    was_paused = isinstance(raw, dict) and raw.get("status") == "paused"
    has_explicit_requirement = isinstance(raw, dict) and "lead_acquisition_requirement" in raw
    if isinstance(raw, dict):
        state.update(
            {
                key: value
                for key, value in raw.items()
                if key not in {"steps", "schema_version"}
            }
        )
        raw_steps = raw.get("steps")
        if isinstance(raw_steps, dict):
            for step in STEPS:
                if isinstance(raw_steps.get(step), dict):
                    state["steps"][step].update(raw_steps[step])
            for step in LEGACY_STEPS:
                if isinstance(raw_steps.get(step), dict):
                    state["steps"][step] = raw_steps[step]

    requirement = str(state.get("lead_acquisition_requirement") or "").strip()
    if not has_explicit_requirement:
        legacy_leads = state["steps"]["leads"]
        if legacy_leads.get("status") == "confirmed":
            requirement = str(
                (legacy_leads.get("answers") or {}).get("requirement_description") or ""
            ).strip()
    state["schema_version"] = ONBOARDING_SCHEMA_VERSION
    state["lead_acquisition_requirement"] = requirement
    state["completion_acknowledged"] = state.get("completion_acknowledged") is True
    for step in STEPS:
        step_state = state["steps"][step]
        if not isinstance(step_state.get("answers"), dict):
            step_state["answers"] = {}
        legacy_items = step_state.pop("applied_items", [])
        recent_items = step_state.get("recent_applied_items")
        if not isinstance(recent_items, list):
            recent_items = []
        if isinstance(legacy_items, list) and legacy_items:
            recent_items = [item for item in legacy_items if isinstance(item, dict)]
        if not isinstance(step_state.get("execution"), (dict, type(None))):
            step_state["execution"] = None
        step_state["recent_applied_items"] = recent_items[-20:]
        try:
            applied_count = int(step_state.get("applied_count") or 0)
        except (TypeError, ValueError):
            applied_count = 0
        step_state["applied_count"] = max(
            0, applied_count, len(legacy_items), len(step_state["recent_applied_items"])
        )

    current_step = _next_step(state)
    state["current_step"] = current_step
    has_progress = any(
        state["steps"][step].get("status") != "pending"
        or bool(state["steps"][step].get("answers"))
        for step in STEPS
    )
    state["status"] = (
        "completed"
        if current_step == "done"
        else "paused"
        if was_paused and has_progress
        else "in_progress"
        if has_progress
        else "not_started"
    )
    if state["status"] != "completed":
        state["completion_acknowledged"] = False
    return state


def public_state(state: dict) -> dict:
    public = json.loads(json.dumps(state, ensure_ascii=True, default=str))
    for step_state in public.get("steps", {}).values():
        if not isinstance(step_state, dict):
            continue
        pending = step_state.get("pending_card")
        if isinstance(pending, dict):
            pending.pop("operation", None)
            execution = step_state.get("execution")
            execution_status = (
                str(execution.get("status") or "") if isinstance(execution, dict) else ""
            )
            if execution_status == "result_unknown":
                pending["status"] = "result_unknown"
                pending["actions"] = [
                    {
                        "type": "resolve_onboarding_execution",
                        "label": "已确认写入，继续",
                        "variant": "primary",
                        "step": pending.get("step"),
                        "card_id": pending.get("card_id"),
                        "resolution": "mark_applied",
                        "confirmed": True,
                    },
                    {
                        "type": "resolve_onboarding_execution",
                        "label": "确认未写入，重新执行",
                        "variant": "secondary",
                        "step": pending.get("step"),
                        "card_id": pending.get("card_id"),
                        "resolution": "retry",
                        "confirmed": True,
                    },
                ]
            elif execution_status == "processing":
                pending["status"] = "processing"
                pending["actions"] = []
        for history_key in ("applied_items", "recent_applied_items"):
            history = step_state.get(history_key)
            if not isinstance(history, list):
                continue
            for item in history:
                if isinstance(item, dict):
                    item.pop("card", None)
                    item.pop("tool_result", None)
    return public


def _reconcile_onboarding_executions(workspace: Workspace, state: dict) -> bool:
    changed = False
    now = datetime.now(UTC)
    for step in STEPS:
        step_state = state["steps"][step]
        execution = step_state.get("execution")
        if not isinstance(execution, dict):
            continue
        if execution.get("status") == "processing":
            try:
                started_at = datetime.fromisoformat(str(execution.get("started_at") or ""))
                if started_at.tzinfo is None:
                    started_at = started_at.replace(tzinfo=UTC)
            except ValueError:
                started_at = now
            if (now - started_at).total_seconds() >= EXECUTION_UNKNOWN_AFTER_SECONDS:
                execution["status"] = "result_unknown"
                execution["updated_at"] = now.isoformat()
                changed = True
        if execution.get("status") != "result_unknown" or step not in {"profile", "site"}:
            continue
        answers = step_state.get("answers") or {}
        if step == "profile":
            matches = bool(answers.get("name")) and all(
                getattr(workspace, field) == answers.get(field, "")
                for field in ("name", "description")
            )
        elif answers.get("site_variant") == "shopify":
            matches = False
        elif answers.get("site_variant") in {"self_hosted", "other"}:
            matches = (
                workspace.site_type == "independent"
                and workspace.vendure_url == answers.get("site_url")
            )
        else:
            matches = (
                workspace.site_type == answers.get("site_type")
                and workspace.vendure_url == answers.get("vendure_url", "")
            )
        if not matches:
            continue
        pending = step_state.get("pending_card") or {}
        step_state.setdefault("recent_applied_items", []).append(
            {
                "card_id": pending.get("card_id") or execution.get("card_id") or "",
                "kind": pending.get("kind") or step,
                "status": "auto_reconciled",
                "applied_at": now.isoformat(),
            }
        )
        step_state["recent_applied_items"] = step_state["recent_applied_items"][-20:]
        step_state["applied_count"] = int(step_state.get("applied_count") or 0) + 1
        step_state["pending_card"] = None
        step_state["execution"] = None
        step_state["status"] = "confirmed"
        changed = True
    if changed:
        state["current_step"] = _next_step(state)
        state["status"] = "completed" if state["current_step"] == "done" else "in_progress"
    return changed


def _next_step(state: dict) -> str:
    for step in STEPS:
        if state["steps"][step].get("status") != "confirmed":
            return step
    return "done"


def _card(step: str, answers: dict) -> dict:
    card_id = f"card_{uuid4().hex}"
    fields: list[dict] = []
    if step == "profile":
        fields = [
            {"key": "name", "label": "公司名称", "value": answers["name"]},
            {"key": "description", "label": "公司简介", "value": answers.get("description", "")},
        ]
        kind = "profile"
        title = "公司资料预览"
    elif step == "site":
        variant = answers.get("site_variant")
        fields = [{"key": "site_type", "label": "站点类型", "value": variant or answers["site_type"]}]
        if variant == "shopify":
            fields.extend(
                [
                    {
                        "key": "shopify_store_url",
                        "label": "Shopify 店铺 URL",
                        "value": answers["shopify_store_url"],
                    },
                    {
                        "key": "shopify_api_key_masked",
                        "label": "API Key",
                        "value": answers["shopify_api_key_masked"],
                    },
                    {
                        "key": "shopify_api_secret_configured",
                        "label": "Secret Key",
                        "value": "已安全填写",
                    },
                ]
            )
        elif variant in {"self_hosted", "other"}:
            fields.extend(
                [
                    {"key": "site_url", "label": "网站地址", "value": answers["site_url"]},
                    {
                        "key": "site_details",
                        "label": "技术 / 类型说明" if variant == "self_hosted" else "具体类型说明",
                        "value": answers["site_details"],
                    },
                ]
            )
        else:
            fields.append(
                {
                    "key": "vendure_url",
                    "label": "站点地址",
                    "value": answers.get("vendure_url", ""),
                }
            )
        kind = "site"
        title = "站点类型预览"
    else:
        fields = [
            {
                "key": "requirement_description",
                "label": "总体获客需求",
                "value": answers["requirement_description"],
            }
        ]
        kind = "lead_requirement"
        title = "总体线索获取需求预览"
    return {
        "card_id": card_id,
        "step": step,
        "kind": kind,
        "title": title,
        "fields": fields,
        "status": "draft",
        "actions": [
            {"type": "apply_onboarding_card", "confirmed": True},
            {"type": "cancel_onboarding_card"},
        ],
    }


def _validate_answers(step: str, answers: dict) -> dict:
    if step == "profile":
        name = " ".join(str(answers.get("name") or "").split()).strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Company name is required"
            )
        description = str(answers.get("description") or "").strip()
        if len(description) > 10000:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Company description is too long",
            )
        return {"name": name, "description": description}
    if step == "site":
        variant = str(answers.get("site_variant") or "").strip().lower()
        if variant:
            if variant not in {"shopify", "self_hosted", "other"}:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Invalid site variant",
                )
            if variant == "shopify":
                stored_fingerprint = str(
                    answers.get("shopify_credentials_fingerprint") or ""
                ).strip()
                stored_mask = str(answers.get("shopify_api_key_masked") or "").strip()
                if stored_fingerprint and stored_mask and not answers.get("shopify_api_key"):
                    return {
                        "site_type": "shopify",
                        "site_variant": "shopify",
                        "shopify_store_url": _valid_http_url(
                            answers.get("shopify_store_url"), "Shopify store URL"
                        ),
                        "shopify_api_key_masked": stored_mask,
                        "shopify_credentials_fingerprint": stored_fingerprint,
                    }
                credentials = _normalize_shopify_credentials(
                    answers.get("shopify_store_url"),
                    answers.get("shopify_api_key"),
                    answers.get("shopify_api_secret_key"),
                )
                return {
                    "site_type": "shopify",
                    "site_variant": "shopify",
                    "shopify_store_url": credentials["store_url"],
                    "shopify_api_key_masked": mask_secret(credentials["api_key"]),
                    "shopify_credentials_fingerprint": _shopify_credentials_fingerprint(
                        credentials
                    ),
                }
            site_url = _valid_http_url(answers.get("site_url"), "Site URL")
            site_details = " ".join(str(answers.get("site_details") or "").split()).strip()
            if not site_details:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Site details are required",
                )
            if len(site_details) > 500:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Site details are too long",
                )
            return {
                "site_type": "independent",
                "site_variant": variant,
                "site_url": site_url,
                "site_details": site_details,
            }
        site_type = str(answers.get("site_type") or "").strip().lower()
        if site_type not in {"none", "shopify", "vendure", "independent"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid site type"
            )
        vendure_url = str(answers.get("vendure_url") or "").strip()
        if site_type in {"vendure", "independent"} and not vendure_url:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Site URL is required"
            )
        if len(vendure_url) > 500:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Site URL is too long"
            )
        return {"site_type": site_type, "vendure_url": vendure_url}
    requirement = " ".join(str(answers.get("requirement_description") or "").split()).strip()
    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Lead acquisition requirement is required",
        )
    if len(requirement) > MAX_REQUIREMENT_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Lead acquisition requirement is too long",
        )
    return {"requirement_description": requirement}


def _valid_http_url(value: object, label: str) -> str:
    normalized = str(value or "").strip().rstrip("/")
    parsed = urlparse(normalized)
    if not normalized or parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{label} must be a valid HTTP or HTTPS URL",
        )
    if len(normalized) > 500:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{label} is too long",
        )
    return normalized


def _normalize_shopify_credentials(store_url: object, api_key: object, secret: object) -> dict:
    normalized = {
        "store_url": _valid_http_url(store_url, "Shopify store URL"),
        "api_key": str(api_key or "").strip(),
        "api_secret_key": str(secret or "").strip(),
    }
    if not normalized["api_key"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Shopify API key is required",
        )
    if not normalized["api_secret_key"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Shopify API secret key is required",
        )
    return normalized


def _shopify_credentials_fingerprint(credentials: dict) -> str:
    settings = get_settings()
    payload = json.dumps(credentials, sort_keys=True, separators=(",", ":")).encode()
    return hmac.new(settings.jwt_secret.encode(), payload, hashlib.sha256).hexdigest()


def _set_state(workspace: Workspace, state: dict) -> None:
    workspace.onboarding_state = state
    flag_modified(workspace, "onboarding_state")


@router.get("")
async def get_onboarding(context: WorkspaceDep, session: SessionDep) -> dict:
    state = normalize_state(context.workspace.onboarding_state)
    if _reconcile_onboarding_executions(context.workspace, state):
        _set_state(context.workspace, state)
        await session.commit()
    return public_state(state)


@router.post("/start")
async def start_onboarding(
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> dict:
    state = normalize_state(context.workspace.onboarding_state)
    if state["status"] == "completed":
        return state
    state["status"] = "in_progress"
    state["current_step"] = _next_step(state)
    _set_state(context.workspace, state)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="onboarding.started",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={},
    )
    await session.commit()
    return state


@router.put("/steps/{step}/draft")
async def save_draft(
    step: OnboardingStep,
    payload: DraftRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> dict:
    state = normalize_state(context.workspace.onboarding_state)
    if state["status"] == "paused":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Onboarding is paused")
    if state["status"] == "not_started":
        state["status"] = "in_progress"
    if state["current_step"] != step:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Draft is not for the current onboarding step",
        )
    execution = state["steps"][step].get("execution")
    if isinstance(execution, dict) and execution.get("status") in {"processing", "result_unknown"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Onboarding execution is active"
        )
    answers = _validate_answers(step, payload.answers)
    card = _card(step, answers)
    previous_card = state["steps"][step].get("pending_card")
    if isinstance(previous_card, dict) and previous_card.get("card_id"):
        card["replaces_card_id"] = previous_card["card_id"]
    state["steps"][step].update(
        {"status": "draft", "answers": answers, "pending_card": card, "execution": None}
    )
    _set_state(context.workspace, state)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="onboarding.draft_saved",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"step": step, "card_id": card["card_id"]},
    )
    await session.commit()
    return state


@router.post("/steps/{step}/apply")
async def apply_card(
    step: OnboardingStep,
    payload: ApplyRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> dict:
    state = normalize_state(context.workspace.onboarding_state)
    if state["status"] == "paused":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Onboarding is paused")
    step_state = state["steps"][step]
    for item in reversed(step_state.get("recent_applied_items") or []):
        if item.get("card_id") == payload.card_id:
            return {**state, "idempotent": True}
    execution = step_state.get("execution")
    if isinstance(execution, dict) and execution.get("status") in {
        "processing",
        "result_unknown",
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Onboarding execution must be resolved before retrying",
        )
    pending = step_state.get("pending_card")
    if not isinstance(pending, dict) or pending.get("card_id") != payload.card_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Onboarding card is stale or invalid"
        )
    pending_kind = str(pending.get("kind") or "")
    legacy_lead_card = step == "leads" and pending_kind == "leads_readiness"
    answers = (
        dict(step_state.get("answers") or {})
        if legacy_lead_card
        else _validate_answers(step, step_state.get("answers") or {})
    )
    if step == "profile":
        context.workspace.name = answers["name"]
        context.workspace.description = answers["description"]
    elif step == "site":
        if answers.get("site_variant") == "shopify":
            credentials = _normalize_shopify_credentials(
                payload.shopify_store_url,
                payload.shopify_api_key,
                payload.shopify_api_secret_key,
            )
            expected = str(answers.get("shopify_credentials_fingerprint") or "")
            supplied = _shopify_credentials_fingerprint(credentials)
            if not expected or not hmac.compare_digest(expected, supplied):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Shopify credentials changed; create a new confirmation card",
                )
            config = await session.scalar(
                select(ShopifyConfig).where(ShopifyConfig.workspace_id == context.workspace.id)
            )
            if config is None:
                config = ShopifyConfig(id=new_id(), workspace_id=context.workspace.id)
                session.add(config)
            settings = get_settings()
            config.store_url = credentials["store_url"]
            config.api_key_encrypted = encrypt_secret(credentials["api_key"], settings)
            config.api_secret_encrypted = encrypt_secret(
                credentials["api_secret_key"], settings
            )
            config.is_active = False
            context.workspace.site_type = "shopify"
            clear_shopify_caches(context.workspace.id)
        elif answers.get("site_variant") in {"self_hosted", "other"}:
            context.workspace.site_type = "independent"
            context.workspace.vendure_url = answers["site_url"]
        else:
            context.workspace.site_type = answers["site_type"]
            context.workspace.vendure_url = answers["vendure_url"]
    else:
        if not legacy_lead_card:
            context.workspace.lead_acquisition_requirement = answers["requirement_description"]
            state["lead_acquisition_requirement"] = answers["requirement_description"]
    step_state["pending_card"] = None
    step_state["execution"] = None
    step_state["status"] = "draft"
    step_state["applied_count"] = int(step_state.get("applied_count") or 0) + 1
    step_state.setdefault("recent_applied_items", []).append(
        {
            "card_id": payload.card_id,
            "kind": pending.get("kind"),
            "status": "applied",
            "applied_at": datetime.now(UTC).isoformat(),
        }
    )
    if step == "leads":
        stage_rows = (
            await session.execute(
                select(Lead.stage, func.count(Lead.id))
                .where(Lead.workspace_id == context.workspace.id)
                .group_by(Lead.stage)
            )
        ).all()
        step_state["recent_applied_items"][-1]["lead_count_by_stage"] = {
            stage: count for stage, count in stage_rows
        }
    step_state["recent_applied_items"] = step_state["recent_applied_items"][-20:]
    _set_state(context.workspace, state)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="onboarding.card_applied",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"step": step, "card_id": payload.card_id},
    )
    await session.commit()
    return state


@router.post("/steps/{step}/executions/{card_id}/resolve")
async def resolve_onboarding_execution(
    step: OnboardingStep,
    card_id: str,
    payload: ResolveExecutionRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> dict:
    if payload.confirmed is not True:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="confirmed=true is required",
        )
    state = normalize_state(context.workspace.onboarding_state)
    step_state = state["steps"][step]
    execution = step_state.get("execution")
    pending = step_state.get("pending_card")
    if (
        not isinstance(execution, dict)
        or execution.get("status") != "result_unknown"
        or execution.get("card_id") != card_id
        or not isinstance(pending, dict)
        or pending.get("card_id") != card_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Onboarding execution does not require resolution",
        )
    now = datetime.now(UTC).isoformat()
    if payload.resolution == "retry":
        execution["status"] = "retry_ready"
        execution["updated_at"] = now
        result = {**state, "retry_ready": True}
    else:
        step_state.setdefault("recent_applied_items", []).append(
            {
                "card_id": card_id,
                "kind": pending.get("kind"),
                "tool": execution.get("tool"),
                "status": "user_reconciled",
                "applied_at": now,
            }
        )
        step_state["recent_applied_items"] = step_state["recent_applied_items"][-20:]
        step_state["applied_count"] = int(step_state.get("applied_count") or 0) + 1
        step_state["pending_card"] = None
        step_state["execution"] = None
        result = {**state, "reconciled": True}
    _set_state(context.workspace, state)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="onboarding.execution_resolved",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"step": step, "card_id": card_id, "resolution": payload.resolution},
    )
    await session.commit()
    return result


@router.post("/steps/{step}/confirm")
async def confirm_step(
    step: OnboardingStep,
    payload: ConfirmRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> dict:
    if payload.confirmed is not True:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="confirmed=true is required"
        )
    state = normalize_state(context.workspace.onboarding_state)
    if state["current_step"] != step:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Step is not current")
    step_state = state["steps"][step]
    if not step_state.get("answers"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Step has no draft answers"
        )
    if step_state.get("pending_card") is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Apply the pending card before confirming"
        )
    if not step_state.get("recent_applied_items"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Apply the pending card before confirming"
        )
    step_state["status"] = "confirmed"
    state["current_step"] = _next_step(state)
    state["status"] = "completed" if state["current_step"] == "done" else "in_progress"
    state["completion_acknowledged"] = False
    _set_state(context.workspace, state)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="onboarding.step_confirmed",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"step": step},
    )
    await session.commit()
    return state


@router.delete("/steps/{step}/cards/{card_id}")
async def cancel_card(
    step: OnboardingStep,
    card_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> dict:
    state = normalize_state(context.workspace.onboarding_state)
    pending = state["steps"][step].get("pending_card")
    if not isinstance(pending, dict) or pending.get("card_id") != card_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Onboarding card is stale or invalid"
        )
    state["steps"][step]["pending_card"] = None
    state["steps"][step]["execution"] = None
    state["steps"][step]["status"] = "draft"
    _set_state(context.workspace, state)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="onboarding.card_cancelled",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"step": step, "card_id": card_id},
    )
    await session.commit()
    return state


@router.post("/pause")
async def pause_onboarding(context: WorkspaceWriteDep, session: SessionDep) -> dict:
    state = normalize_state(context.workspace.onboarding_state)
    if state["status"] not in {"in_progress", "paused"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Onboarding cannot be paused in the current state",
        )
    state["status"] = "paused"
    _set_state(context.workspace, state)
    await session.commit()
    return state


@router.post("/continue")
async def continue_onboarding(context: WorkspaceWriteDep, session: SessionDep) -> dict:
    state = normalize_state(context.workspace.onboarding_state)
    if state["status"] == "paused":
        state["status"] = "in_progress"
        _set_state(context.workspace, state)
        await session.commit()
    return state


@router.post("/restart")
async def restart_onboarding(
    payload: ConfirmRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> dict:
    if payload.confirmed is not True:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="confirmed=true is required"
        )
    state = normalize_state(context.workspace.onboarding_state)
    restarted = _default_state()
    restarted["lead_acquisition_requirement"] = state.get("lead_acquisition_requirement", "")
    _set_state(context.workspace, restarted)
    await session.commit()
    return restarted


@router.post("/finish")
async def finish_onboarding(
    payload: ConfirmRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> dict:
    if payload.confirmed is not True:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="confirmed=true is required"
        )
    state = normalize_state(context.workspace.onboarding_state)
    if state["status"] != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Onboarding is not complete"
        )
    if not state.get("completion_acknowledged"):
        state["completion_acknowledged"] = True
        _set_state(context.workspace, state)
        await session.commit()
    return state


@router.post("/back")
async def back_onboarding(
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> dict:
    state = normalize_state(context.workspace.onboarding_state)
    current = state.get("current_step")
    if current not in {"site", "leads"} or state["status"] != "in_progress":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Cannot go back from the current step"
        )
    current_execution = state["steps"][current].get("execution")
    if isinstance(current_execution, dict) and current_execution.get("status") in {
        "processing",
        "result_unknown",
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot go back while an onboarding execution is unresolved",
        )
    previous = STEPS[STEPS.index(current) - 1]
    previous_state = state["steps"][previous]
    previous_state["status"] = "draft"
    answers = dict(previous_state.get("answers") or {})
    if previous == "profile" and not answers.get("name"):
        answers = {"name": context.workspace.name, "description": context.workspace.description}
    elif previous == "site" and not answers.get("site_type"):
        answers = {
            "site_type": context.workspace.site_type or "none",
            "vendure_url": context.workspace.vendure_url,
        }
    previous_state["answers"] = answers
    if previous_state.get("pending_card") is None:
        previous_state["pending_card"] = _card(previous, answers)
    state["current_step"] = previous
    _set_state(context.workspace, state)
    await session.commit()
    return state
