import json
from dataclasses import dataclass, field
from typing import Protocol

import httpx

from app.modules.agent.registry import openai_tools


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict = field(default_factory=dict)
    execution_key: str | None = None


@dataclass(frozen=True)
class AgentPlan:
    text: str = ""
    tool_calls: tuple[ToolCall, ...] = ()


class ModelGateway(Protocol):
    async def plan(self, *, message: str, history: list[dict]) -> AgentPlan: ...


class ModelGatewayError(RuntimeError):
    pass


class OpenAICompatibleModelGateway:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        timeout_seconds: float = 30,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.client = client

    async def plan(self, *, message: str, history: list[dict]) -> AgentPlan:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are the Mekyro supplier operations assistant. Use tools for business "
                    "data, never invent records, and answer in the user's language."
                ),
            }
        ]
        for item in history:
            role = item.get("role")
            content = str(item.get("content") or "").strip()
            if role == "assistant" and item.get("tool_calls"):
                messages.append(
                    {
                        "role": "assistant",
                        "content": content or None,
                        "tool_calls": item["tool_calls"],
                    }
                )
            elif role == "tool" and item.get("tool_call_id") and content:
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": item["tool_call_id"],
                        "content": content,
                    }
                )
            elif role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
        if message and messages[-1] != {"role": "user", "content": message}:
            messages.append({"role": "user", "content": message})
        payload = {
            "model": self.model,
            "messages": messages,
            "tools": openai_tools(),
            "tool_choice": "auto",
            "stream": False,
        }
        try:
            if self.client is None:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json=payload,
                    )
            else:
                response = await self.client.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json=payload,
                )
            response.raise_for_status()
            body = response.json()
            response_message = body["choices"][0]["message"]
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise ModelGatewayError("Agent model request failed") from exc

        tool_calls = []
        for item in response_message.get("tool_calls") or []:
            function = item.get("function") or {}
            name = str(function.get("name") or "")
            if not name:
                continue
            raw_arguments = function.get("arguments") or "{}"
            try:
                arguments = json.loads(raw_arguments) if isinstance(raw_arguments, str) else raw_arguments
            except json.JSONDecodeError as exc:
                raise ModelGatewayError("Agent model returned invalid tool arguments") from exc
            if not isinstance(arguments, dict):
                raise ModelGatewayError("Agent model returned non-object tool arguments")
            tool_calls.append(ToolCall(name=name, arguments=arguments, execution_key=item.get("id")))
        return AgentPlan(
            text=str(response_message.get("content") or ""),
            tool_calls=tuple(tool_calls),
        )


class DeterministicModelGateway:
    """Offline fallback used by development, tests, and provider outages."""

    async def plan(self, *, message: str, history: list[dict]) -> AgentPlan:
        normalized = " ".join(message.strip().split())
        if not normalized:
            for item in reversed(history):
                if item.get("role") != "tool" or not item.get("content"):
                    continue
                try:
                    result = json.loads(str(item["content"]))
                except (TypeError, ValueError, json.JSONDecodeError):
                    continue
                if isinstance(result, dict) and isinstance(result.get("results"), list):
                    rows = result["results"]
                    if rows and all(isinstance(row, dict) and row.get("name") for row in rows):
                        names = [str(row["name"]) for row in rows]
                        return AgentPlan(
                            text=f"当前工作区共有 {result.get('total', len(names))} 个商品："
                            + "、".join(names)
                            + "。"
                        )
                    if rows and all(isinstance(row, dict) and row.get("merchant_name") for row in rows):
                        names = [str(row["merchant_name"]) for row in rows]
                        return AgentPlan(
                            text=f"当前工作区共有 {result.get('total', len(names))} 条线索："
                            + "、".join(names)
                            + "。"
                        )
                    return AgentPlan(text=f"已查询到 {result.get('total', len(rows))} 条当前工作区记录。")
                if isinstance(result, dict):
                    return AgentPlan(text=json.dumps(result, ensure_ascii=False))
            return AgentPlan()
        lowered = normalized.lower()
        if lowered.startswith("/tool "):
            name, _, raw_arguments = normalized[6:].partition(" ")
            try:
                arguments = json.loads(raw_arguments) if raw_arguments else {}
            except json.JSONDecodeError:
                return AgentPlan(text="工具参数不是有效的 JSON 对象。")
            if not isinstance(arguments, dict):
                return AgentPlan(text="工具参数必须是 JSON 对象。")
            return AgentPlan(tool_calls=(ToolCall(name=name, arguments=arguments),))
        if any(term in lowered for term in ("线索阶段", "lead stage", "count leads")):
            return AgentPlan(tool_calls=(ToolCall(name="lead_count_by_stage"),))
        if any(term in lowered for term in ("查看线索", "线索列表", "list leads")):
            return AgentPlan(tool_calls=(ToolCall(name="lead_list_leads"),))
        if any(term in lowered for term in ("查看库存", "sku 列表", "list skus")):
            return AgentPlan(tool_calls=(ToolCall(name="product_list_skus"),))
        if any(
            term in lowered
            for term in (
                "查看商品",
                "商品列表",
                "有哪些商品",
                "我们的商品",
                "list products",
                "what products",
                "which products",
                "our products",
                "products do we have",
            )
        ):
            return AgentPlan(tool_calls=(ToolCall(name="product_list_products"),))
        if any(term in lowered for term in ("查看配置", "workspace config", "supplier profile")):
            return AgentPlan(tool_calls=(ToolCall(name="config_get_profile"),))
        return AgentPlan(text="我可以查询线索、商品和库存，也可在你确认后执行业务写操作。")
