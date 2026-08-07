import json

import httpx
import pytest

from app.core.config import get_settings
from app.main import create_app
from app.modules.agent.gateway import ModelGatewayError, OpenAICompatibleModelGateway
from app.modules.agent.registry import TOOLS, openai_tools


def test_agent_openai_tool_schemas_cover_complete_registry():
    tools = openai_tools()
    assert {item["function"]["name"] for item in tools} == set(TOOLS)
    assert all(item["function"]["parameters"]["type"] == "object" for item in tools)
    by_name = {item["function"]["name"]: item["function"]["parameters"] for item in tools}
    assert by_name["lead_get_detail"]["required"] == ["lead_id"]
    assert by_name["product_create"]["required"] == ["name"]
    assert by_name["product_adjust_stock"]["required"] == ["sku_id", "type", "quantity"]
    assert by_name["config_delete_shopify"]["required"] == ["confirm"]


def test_create_app_selects_configured_openai_compatible_gateway(monkeypatch):
    monkeypatch.setenv("MEKYRO_AGENT_API_KEY", "configured-secret")
    monkeypatch.setenv("MEKYRO_AGENT_BASE_URL", "https://gateway.example/v1")
    monkeypatch.setenv("MEKYRO_AGENT_MODEL", "configured-model")
    get_settings.cache_clear()
    try:
        application = create_app(auto_create_schema=False, auto_seed=False)
        gateway = application.state.agent_gateway
        assert isinstance(gateway, OpenAICompatibleModelGateway)
        assert gateway.base_url == "https://gateway.example/v1"
        assert gateway.model == "configured-model"
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_openai_compatible_gateway_sends_history_tools_and_parses_tool_calls():
    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["authorization"] = request.headers["Authorization"]
        captured["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "我会先查询库存。",
                            "tool_calls": [
                                {
                                    "id": "call-stock-1",
                                    "type": "function",
                                    "function": {
                                        "name": "product_check_stock",
                                        "arguments": '{"sku_id":"variant-1"}',
                                    },
                                }
                            ],
                        }
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gateway = OpenAICompatibleModelGateway(
            api_key="secret-agent-key",
            base_url="https://model.example/v1/",
            model="test-model",
            client=client,
        )
        plan = await gateway.plan(
            message="查一下库存",
            history=[
                {"role": "user", "content": "之前的问题"},
                {"role": "assistant", "content": "之前的回答"},
                {"role": "tool", "content": ""},
                {"role": "user", "content": "查一下库存"},
            ],
        )

    assert captured["authorization"] == "Bearer secret-agent-key"
    assert captured["payload"]["model"] == "test-model"
    assert captured["payload"]["stream"] is False
    assert len(captured["payload"]["tools"]) == len(TOOLS)
    assert captured["payload"]["messages"][-1] == {"role": "user", "content": "查一下库存"}
    assert all(item["role"] != "tool" for item in captured["payload"]["messages"])
    assert plan.text == "我会先查询库存。"
    assert plan.tool_calls[0].name == "product_check_stock"
    assert plan.tool_calls[0].arguments == {"sku_id": "variant-1"}
    assert plan.tool_calls[0].execution_key == "call-stock-1"


@pytest.mark.asyncio
async def test_openai_compatible_gateway_sends_tool_results_for_continuation():
    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "当前库存为 12 件。"}}]},
        )

    history = [
        {"role": "user", "content": "查一下库存"},
        {
            "role": "assistant",
            "content": "我来查询。",
            "tool_calls": [
                {
                    "id": "call-stock-1",
                    "type": "function",
                    "function": {
                        "name": "product_check_stock",
                        "arguments": '{"sku_id":"variant-1"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-stock-1",
            "content": '{"stock_quantity":12}',
        },
    ]
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gateway = OpenAICompatibleModelGateway(
            api_key="secret-agent-key",
            base_url="https://model.example/v1",
            model="test-model",
            client=client,
        )
        plan = await gateway.plan(message="", history=history)

    assert captured["payload"]["messages"][-2:] == history[-2:]
    assert plan.text == "当前库存为 12 件。"
    assert plan.tool_calls == ()


@pytest.mark.asyncio
async def test_openai_compatible_gateway_maps_http_and_invalid_argument_failures():
    async def http_failure(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "unavailable"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(http_failure)) as client:
        gateway = OpenAICompatibleModelGateway(
            api_key="secret",
            base_url="https://model.example/v1",
            model="test-model",
            client=client,
        )
        with pytest.raises(ModelGatewayError, match="Agent model request failed"):
            await gateway.plan(message="hello", history=[])

    async def invalid_arguments(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": "bad-call",
                                    "function": {
                                        "name": "lead_get_detail",
                                        "arguments": "not-json",
                                    },
                                }
                            ]
                        }
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(invalid_arguments)) as client:
        gateway = OpenAICompatibleModelGateway(
            api_key="secret",
            base_url="https://model.example/v1",
            model="test-model",
            client=client,
        )
        with pytest.raises(ModelGatewayError, match="invalid tool arguments"):
            await gateway.plan(message="hello", history=[])
