import json

import httpx
import pytest

from app.core.config import get_settings
from app.main import create_app
from app.modules.agent.gateway import (
    DeterministicModelGateway,
    ModelGatewayError,
    OpenAICompatibleModelGateway,
)
from app.modules.agent.registry import TOOLS, openai_tools
from app.modules.agent.service import _optimize_lead_requirement


def test_agent_openai_tool_schemas_cover_complete_registry():
    tools = openai_tools()
    assert {item["function"]["name"] for item in tools} == set(TOOLS)
    assert all(item["function"]["parameters"]["type"] == "object" for item in tools)
    by_name = {item["function"]["name"]: item["function"]["parameters"] for item in tools}
    assert by_name["lead_list_leads"]["properties"]["country"]["maxLength"] == 2
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
    assert captured["payload"]["temperature"] == 0.2
    assert captured["payload"]["max_tokens"] == 1200
    system_prompt = captured["payload"]["messages"][0]["content"]
    assert "Markdown table" in system_prompt
    assert "Preserve conversational context" in system_prompt
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
async def test_openai_compatible_gateway_optimizes_lead_requirement_without_inventing_fields():
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
                            "content": "持续寻找欧美地区经营二手机并拥有线下门店或批发渠道的采购商。"
                        }
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gateway = OpenAICompatibleModelGateway(
            api_key="deepseek-secret",
            base_url="https://api.deepseek.com/",
            model="deepseek-chat",
            client=client,
        )
        optimized = await gateway.optimize_lead_requirement(
            "找欧美做二手机、有线下门店或者批发渠道的采购商"
        )

    assert captured["authorization"] == "Bearer deepseek-secret"
    assert captured["payload"]["model"] == "deepseek-chat"
    assert captured["payload"]["stream"] is False
    assert captured["payload"]["temperature"] == 0.2
    assert captured["payload"]["messages"][-1]["content"] == (
        "找欧美做二手机、有线下门店或者批发渠道的采购商"
    )
    system_prompt = captured["payload"]["messages"][0]["content"]
    assert "不能扩写需求" in system_prompt
    assert "口语化、含糊或聊天式表达" in system_prompt
    assert "想要一些" in system_prompt
    assert "把商品卖给他们" in system_prompt
    assert "不得在国家列表后添加‘等欧美国家’" in system_prompt
    assert "寻找印度、芬兰的买家，向其销售现有商品" in system_prompt
    assert "产品名称和渠道名称必须原样保留" in system_prompt
    assert "严禁新增采购能力" in system_prompt
    assert optimized == "持续寻找欧美地区经营二手机并拥有线下门店或批发渠道的采购商。"


@pytest.mark.asyncio
async def test_openai_compatible_gateway_maps_lead_optimization_failure():
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "unavailable"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        gateway = OpenAICompatibleModelGateway(
            api_key="secret",
            base_url="https://api.deepseek.com",
            model="deepseek-chat",
            client=client,
        )
        with pytest.raises(ModelGatewayError, match="Lead requirement optimization failed"):
            await gateway.optimize_lead_requirement("寻找欧洲采购商")


@pytest.mark.asyncio
async def test_lead_requirement_optimization_does_not_fake_success_on_provider_failure():
    class FailingGateway:
        async def optimize_lead_requirement(self, _requirement: str) -> str:
            raise ModelGatewayError("provider unavailable")

    with pytest.raises(ModelGatewayError, match="provider unavailable"):
        await _optimize_lead_requirement(
            FailingGateway(),
            "  持续寻找欧美地区\n经营二手机的采购商  ",
        )


@pytest.mark.asyncio
async def test_deterministic_gateway_rejects_fake_lead_optimization():
    gateway = DeterministicModelGateway()

    with pytest.raises(ModelGatewayError, match="requires a configured model"):
        await gateway.optimize_lead_requirement("想找一些海外买家")


@pytest.mark.asyncio
async def test_deterministic_gateway_explains_lead_totals_and_filtered_rows():
    gateway = DeterministicModelGateway()
    totals = await gateway.plan(
        message="",
        history=[
            {
                "role": "assistant",
                "tool_calls": [
                    {
                        "id": "call-count",
                        "type": "function",
                        "function": {"name": "lead_count_by_stage", "arguments": "{}"},
                    }
                ],
            },
            {
                "role": "tool",
                "tool_call_id": "call-count",
                "content": '{"total":121,"stats":[{"stage":"new","count":121,"ratio":1}]}',
            },
        ],
    )
    assert "**121 条线索**" in totals.text
    assert "尚未开始联系" in totals.text
    assert "建议下一步" in totals.text

    filtered = await gateway.plan(
        message="",
        history=[
            {
                "role": "assistant",
                "tool_calls": [
                    {
                        "id": "call-jp",
                        "type": "function",
                        "function": {
                            "name": "lead_list_leads",
                            "arguments": '{"country":"JP"}',
                        },
                    }
                ],
            },
            {
                "role": "tool",
                "tool_call_id": "call-jp",
                "content": (
                    '{"total":1,"results":[{"merchant_name":"Laifen Japan",'
                    '"company_name":"Laifen Japan","stage":"new",'
                    '"recommendation_score":92}]}'
                ),
            },
        ],
    )
    assert "地区为日本的线索共有 **1 条**" in filtered.text
    assert "| 商家名称 | 企业名称 | 阶段 | 推荐评分 |" in filtered.text
    assert "Laifen Japan" in filtered.text

    follow_up = await gateway.plan(
        message="地区是日本的有几个",
        history=[{"role": "user", "content": "有多少条线索？"}],
    )
    assert follow_up.tool_calls[0].name == "lead_list_leads"
    assert follow_up.tool_calls[0].arguments == {"country": "JP"}


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
