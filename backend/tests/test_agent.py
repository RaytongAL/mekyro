import json

from fastapi.testclient import TestClient

from app.modules.agent.gateway import AgentPlan, ToolCall
from app.modules.agent.registry import TOOLS
from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def parse_sse(response) -> list[tuple[str, dict]]:
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = []
    for block in response.text.strip().split("\n\n"):
        lines = block.splitlines()
        assert lines[0].startswith("event: ")
        assert lines[1].startswith("data: ")
        events.append((lines[0][7:], json.loads(lines[1][6:])))
    return events


def event(events: list[tuple[str, dict]], name: str) -> dict:
    return next(payload for event_name, payload in events if event_name == name)


def agent_url(workspace_id: str = IDS["workspace_newlife"]) -> str:
    return f"/api/v1/workspaces/{workspace_id}/agent/chat"


def run_tool(
    client: TestClient,
    token: str,
    *,
    tool: str,
    input: dict | None = None,
    execution_key: str | None = None,
    conversation_id: str | None = None,
    workspace_id: str = IDS["workspace_newlife"],
) -> list[tuple[str, dict]]:
    action = {"type": "run_tool", "tool": tool, "input": input or {}}
    if execution_key:
        action["execution_key"] = execution_key
    payload: dict = {"action": action}
    if conversation_id:
        payload["conversation_id"] = conversation_id
    return parse_sse(
        client.post(
            agent_url(workspace_id),
            headers=auth_header(token),
            json=payload,
        )
    )


def approve(
    client: TestClient,
    token: str,
    conversation_id: str,
    card: dict,
) -> list[tuple[str, dict]]:
    return parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(token),
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "approve_agent_execution",
                    "approval_id": card["approval_id"],
                    "execution_key": card["execution_key"],
                },
            },
        )
    )


def execute_write(
    client: TestClient,
    token: str,
    *,
    tool: str,
    input: dict,
    execution_key: str,
) -> dict:
    requested = run_tool(
        client,
        token,
        tool=tool,
        input=input,
        execution_key=execution_key,
    )
    result = approve(
        client,
        token,
        event(requested, "conversation")["conversation_id"],
        event(requested, "approval_card"),
    )
    return event(result, "tool_result")["result"]


def test_agent_authenticated_sse_chat_persists_and_resumes_conversation(
    client: TestClient,
    newlife_token: str,
):
    unauthorized = client.post(agent_url(), json={"message": "查看线索列表"})
    assert unauthorized.status_code == 401
    assert (
        client.post(
            agent_url(), headers=auth_header(newlife_token), json={"message": ""}
        ).status_code
        == 422
    )
    assert (
        client.post(
            agent_url(), headers=auth_header(newlife_token), json={"message": "x" * 2001}
        ).status_code
        == 422
    )

    events = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"message": "查看线索列表"},
        )
    )
    conversation_id = event(events, "conversation")["conversation_id"]
    assert event(events, "tool_call")["tool"] == "lead_list_leads"
    lead_result = event(events, "tool_result")["result"]
    assert lead_result["total"] == 3
    assert all(item["workspace_id"] == IDS["workspace_newlife"] for item in lead_result["results"])
    assert any(item["latest_contact_at"] is not None for item in lead_result["results"])
    assert event(events, "done")["conversation_id"] == conversation_id

    resumed = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"conversation_id": conversation_id, "message": "线索阶段统计"},
        )
    )
    assert event(resumed, "conversation")["conversation_id"] == conversation_id
    assert event(resumed, "tool_result")["result"]["total"] == 3


def test_deterministic_agent_answers_natural_product_question_with_tenant_products(
    client: TestClient,
):
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "aurora", "password": "Mekyro123!"},
    )
    assert login.status_code == 200
    aurora_token = login.json()["access_token"]
    events = parse_sse(
        client.post(
            agent_url(IDS["workspace_aurora"]),
            headers=auth_header(aurora_token),
            json={"message": "What products do we have?"},
        )
    )
    assert event(events, "tool_call")["tool"] == "product_list_products"
    texts = [payload["text"] for name, payload in events if name == "text"]
    assert any("Aurora Wi-Fi Smart Lamp" in text for text in texts)
    assert all("Refurbished" not in text for text in texts)

def test_agent_lead_tools_are_tenant_scoped_and_cover_django_read_contract(
    client: TestClient,
    newlife_token: str,
):
    details = run_tool(
        client, newlife_token, tool="lead_get_detail", input={"lead_id": IDS["lead_paris"]}
    )
    detail_result = event(details, "tool_result")["result"]
    assert detail_result["company_name"] == "PMR Distribution SAS"
    assert detail_result["latest_contact_at"] is not None

    logs = run_tool(
        client,
        newlife_token,
        tool="lead_get_contact_logs",
        input={"lead_id": IDS["lead_paris"]},
    )
    assert event(logs, "tool_result")["result"]["total"] >= 1

    foreign = run_tool(
        client, newlife_token, tool="lead_get_detail", input={"lead_id": IDS["lead_dubai"]}
    )
    error_payload = event(foreign, "error")
    assert error_payload["code"] == "TOOL_VALIDATION_FAILED"
    assert "Dubai" not in json.dumps(foreign)


def test_agent_product_write_requires_approval_and_duplicate_confirmation_is_idempotent(
    client: TestClient,
    newlife_token: str,
):
    requested = run_tool(
        client,
        newlife_token,
        tool="product_create",
        execution_key="agent-product-create-001",
        input={
            "name": "Agent Wholesale Phone",
            "skus": [
                {
                    "sku_code": "AGENT-PHONE-001",
                    "stock_quantity": 8,
                    "price_tiers": [{"minimum_quantity": 1, "unit_price": "120.00"}],
                }
            ],
        },
    )
    conversation_id = event(requested, "conversation")["conversation_id"]
    card = event(requested, "approval_card")
    assert not any(name == "tool_result" for name, _ in requested)
    before = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/products?search=Agent%20Wholesale",
        headers=auth_header(newlife_token),
    )
    assert before.json()["total"] == 0

    first = approve(client, newlife_token, conversation_id, card)
    created = event(first, "tool_result")["result"]["created"]
    assert created["variants"][0]["sku_code"] == "AGENT-PHONE-001"
    second = approve(client, newlife_token, conversation_id, card)
    replayed = event(second, "tool_result")
    assert replayed["replayed"] is True
    assert replayed["result"]["created"]["id"] == created["id"]
    after = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/products?search=Agent%20Wholesale",
        headers=auth_header(newlife_token),
    )
    assert after.json()["total"] == 1


def test_agent_inventory_adjustment_uses_approval_and_business_idempotency(
    client: TestClient,
    newlife_token: str,
):
    variant_id = IDS["variant_charger"]
    before = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/variants/{variant_id}",
        headers=auth_header(newlife_token),
    ).json()["stock_quantity"]
    requested = run_tool(
        client,
        newlife_token,
        tool="product_adjust_stock",
        execution_key="agent-inventory-inbound-001",
        input={
            "sku_id": variant_id,
            "type": "inbound",
            "quantity": 7,
            "reason": "Agent replenishment",
        },
    )
    conversation_id = event(requested, "conversation")["conversation_id"]
    card = event(requested, "approval_card")
    result = event(approve(client, newlife_token, conversation_id, card), "tool_result")
    assert result["result"]["adjusted"]["balance_after"] == before + 7
    approve(client, newlife_token, conversation_id, card)
    after = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/variants/{variant_id}",
        headers=auth_header(newlife_token),
    ).json()["stock_quantity"]
    assert after == before + 7


def test_agent_catalog_write_adapters_cover_product_sku_update_delete_and_import(
    client: TestClient,
    newlife_token: str,
):
    updated = execute_write(
        client,
        newlife_token,
        tool="product_update",
        execution_key="agent-product-update-001",
        input={"product_id": IDS["product_charger"], "name": "Agent Updated Charger"},
    )
    assert updated["updated"]["name"] == "Agent Updated Charger"

    created_sku = execute_write(
        client,
        newlife_token,
        tool="product_create_sku",
        execution_key="agent-sku-create-001",
        input={
            "product_id": IDS["product_charger"],
            "sku_code": "AGENT-CHARGER-BULK",
            "specs": {"plug": "EU"},
            "stock_quantity": 3,
            "price_tiers": [{"minimum_quantity": 1, "unit_price": "8.50"}],
        },
    )["created"]
    changed_sku = execute_write(
        client,
        newlife_token,
        tool="product_update_sku",
        execution_key="agent-sku-update-001",
        input={
            "sku_id": created_sku["id"],
            "moq": 5,
            "stock_quantity": 11,
        },
    )["updated"]
    assert changed_sku["minimum_order_quantity"] == 5
    assert changed_sku["stock_quantity"] == 11
    checked = run_tool(
        client,
        newlife_token,
        tool="product_check_stock",
        input={"sku_id": created_sku["id"]},
    )
    assert event(checked, "tool_result")["result"]["stock_quantity"] == 11
    deleted_sku = execute_write(
        client,
        newlife_token,
        tool="product_delete_sku",
        execution_key="agent-sku-delete-001",
        input={"sku_id": created_sku["id"]},
    )
    assert deleted_sku["deleted"] is True

    imported = execute_write(
        client,
        newlife_token,
        tool="product_import",
        execution_key="agent-product-import-001",
        input={
            "rows": [
                {
                    "row": 1,
                    "product_name": "Agent Imported Case",
                    "category_path": "Accessories/Cases",
                    "description": "Imported through approved Agent tool",
                    "sku_code": "AGENT-IMPORT-CASE-001",
                    "specs": {"color": "Black"},
                    "moq": 10,
                    "currency": "USD",
                    "stock_quantity": 20,
                    "status": "active",
                    "unit_price": 4.5,
                    "product_images": [],
                    "product_detail_image": "",
                    "sku_image": "",
                }
            ]
        },
    )
    assert imported == {
        "imported": True,
        "created_products": 1,
        "created_skus": 1,
        "batches": 1,
        "errors": [],
    }
    template = run_tool(client, newlife_token, tool="product_download_template")
    assert event(template, "tool_result")["result"]["template_url"].endswith(
        "/product-import/template"
    )

    deleted_product = execute_write(
        client,
        newlife_token,
        tool="product_delete",
        execution_key="agent-product-delete-001",
        input={"product_id": IDS["product_charger"]},
    )
    assert deleted_product["deleted"] is True


def test_agent_configuration_tool_encrypts_and_never_streams_secrets(
    client: TestClient,
    newlife_token: str,
):
    api_key = "agent-client-key-private"
    api_secret = "agent-client-secret-private"
    requested = run_tool(
        client,
        newlife_token,
        tool="config_update_shopify",
        execution_key="agent-shopify-config-001",
        input={
            "store_url": "https://agent-store.myshopify.com",
            "api_key": api_key,
            "api_secret_key": api_secret,
        },
    )
    serialized = json.dumps(requested)
    assert api_key not in serialized
    assert api_secret not in serialized
    assert "gAAAA" not in serialized
    card = event(requested, "approval_card")
    assert card["input"]["api_key_configured"] is True
    assert card["input"]["api_secret_key_configured"] is True
    conversation_id = event(requested, "conversation")["conversation_id"]
    approved = approve(client, newlife_token, conversation_id, card)
    assert event(approved, "tool_result")["result"]["is_active"] is False

    config = run_tool(client, newlife_token, tool="config_get_profile")
    public = event(config, "tool_result")["result"]
    assert public["api_key_configured"] is True
    assert public["api_key_masked"].endswith("vate")
    assert api_key not in json.dumps(config)
    assert api_secret not in json.dumps(config)

    profile = execute_write(
        client,
        newlife_token,
        tool="config_update_profile",
        execution_key="agent-workspace-profile-001",
        input={"description": "Agent-managed supplier profile"},
    )
    assert profile["updated"] == ["description"]
    enabled = execute_write(
        client,
        newlife_token,
        tool="config_toggle_shopify",
        execution_key="agent-shopify-enable-001",
        input={"enabled": True},
    )
    assert enabled["is_active"] is True
    disabled = execute_write(
        client,
        newlife_token,
        tool="config_toggle_shopify",
        execution_key="agent-shopify-disable-001",
        input={"enabled": False},
    )
    assert disabled["is_active"] is False
    deleted = execute_write(
        client,
        newlife_token,
        tool="config_delete_shopify",
        execution_key="agent-shopify-delete-001",
        input={"confirm": True},
    )
    assert deleted["deleted"] is True


def test_agent_onboarding_resume_card_confirm_pause_continue_and_duplicate_apply(
    client: TestClient,
    newlife_token: str,
):
    resumed = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"action": {"type": "resume_onboarding"}},
        )
    )
    conversation_id = event(resumed, "conversation")["conversation_id"]
    assert event(resumed, "onboarding_context")["current_step"] == "profile"
    welcome_texts = [payload["text"] for name, payload in resumed if name == "text"]
    assert any("三个简短步骤" in text and "企业名称" in text for text in welcome_texts)
    assert all("profile" not in text for text in welcome_texts)

    profile = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"conversation_id": conversation_id, "message": "Agent Onboarding Supplier"},
        )
    )
    card = event(profile, "onboarding_card")
    assert card["step"] == "profile"
    detail = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}",
        headers=auth_header(newlife_token),
    )
    assert detail.json()["name"] != "Agent Onboarding Supplier"

    confirm_payload = {
        "conversation_id": conversation_id,
        "action": {
            "type": "confirm_onboarding_card",
            "step": "profile",
            "card_id": card["card_id"],
        },
    }
    confirmed = parse_sse(
        client.post(agent_url(), headers=auth_header(newlife_token), json=confirm_payload)
    )
    assert event(confirmed, "onboarding_context")["current_step"] == "site"
    duplicate = parse_sse(
        client.post(agent_url(), headers=auth_header(newlife_token), json=confirm_payload)
    )
    assert event(duplicate, "onboarding_context")["current_step"] == "site"

    site = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {"type": "select_onboarding_site", "site_type": "shopify"},
            },
        )
    )
    assert event(site, "onboarding_card")["step"] == "site"
    paused = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"conversation_id": conversation_id, "action": {"type": "pause_onboarding"}},
        )
    )
    assert event(paused, "onboarding_context")["status"] == "paused"
    continued = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {"type": "continue_onboarding"},
            },
        )
    )
    assert event(continued, "onboarding_context")["status"] == "in_progress"

    cancelled = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "cancel_onboarding_card",
                    "step": "site",
                    "card_id": event(site, "onboarding_card")["card_id"],
                },
            },
        )
    )
    assert event(cancelled, "tool_result")["result"]["steps"]["site"]["pending_card"] is None
    site_again = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {"type": "select_onboarding_site", "site_type": "shopify"},
            },
        )
    )
    site_card = event(site_again, "onboarding_card")
    site_confirmed = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "confirm_onboarding_card",
                    "step": "site",
                    "card_id": site_card["card_id"],
                },
            },
        )
    )
    assert event(site_confirmed, "onboarding_context")["current_step"] == "leads"
    lead_card_events = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "message": "European distributors seeking recurring refurbished inventory",
            },
        )
    )
    lead_card = event(lead_card_events, "onboarding_card")
    backed = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {"type": "back_onboarding_step"},
            },
        )
    )
    assert event(backed, "onboarding_context")["current_step"] == "site"
    restarted = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {"type": "restart_onboarding", "confirmed": True},
            },
        )
    )
    assert event(restarted, "onboarding_context")["status"] == "not_started"
    assert lead_card["step"] == "leads"


def test_agent_execution_key_deduplicates_pending_approval_and_rejects_mismatch(
    client: TestClient,
    newlife_token: str,
):
    first = run_tool(
        client,
        newlife_token,
        tool="product_delete",
        execution_key="agent-delete-pending-001",
        input={"product_id": IDS["product_charger"]},
    )
    conversation_id = event(first, "conversation")["conversation_id"]
    first_card = event(first, "approval_card")
    replay = run_tool(
        client,
        newlife_token,
        tool="product_delete",
        execution_key="agent-delete-pending-001",
        input={"product_id": IDS["product_charger"]},
        conversation_id=conversation_id,
    )
    assert event(replay, "approval_card")["approval_id"] == first_card["approval_id"]

    mismatch = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "approve_agent_execution",
                    "approval_id": first_card["approval_id"],
                    "execution_key": "wrong-key",
                },
            },
        )
    )
    assert event(mismatch, "error")["code"] == "EXECUTION_KEY_MISMATCH"
    reject = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "reject_agent_execution",
                    "approval_id": first_card["approval_id"],
                },
            },
        )
    )
    assert event(reject, "tool_result")["result"] == {"cancelled": True}


def test_agent_registry_and_model_gateway_cover_all_django_toolkits(
    client: TestClient,
    newlife_token: str,
):
    expected = {
        "lead_list_leads",
        "lead_get_detail",
        "lead_get_contact_logs",
        "lead_count_by_stage",
        "product_list_products",
        "product_get_detail",
        "product_list_skus",
        "product_download_template",
        "product_import",
        "product_check_stock",
        "product_create",
        "product_update",
        "product_delete",
        "product_create_sku",
        "product_update_sku",
        "product_delete_sku",
        "product_adjust_stock",
        "config_get_profile",
        "config_update_profile",
        "config_update_shopify",
        "config_toggle_shopify",
        "config_delete_shopify",
        "knowledge_search",
        "onboarding_get_status",
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
    assert set(TOOLS) == expected

    class FixedGateway:
        calls = 0

        async def plan(self, *, message: str, history: list[dict]) -> AgentPlan:
            self.calls += 1
            if self.calls == 1:
                assert message == "custom model request"
                assert history[-1]["content"] == message
                return AgentPlan(
                    text="model accepted",
                    tool_calls=(
                        ToolCall(
                            name="product_get_detail",
                            arguments={"product_id": IDS["product_iphone"]},
                            execution_key="call-product-detail",
                        ),
                    ),
                )
            assert message == ""
            assert history[-2]["role"] == "assistant"
            assert history[-2]["tool_calls"][0]["id"] == "call-product-detail"
            assert history[-1]["role"] == "tool"
            assert history[-1]["tool_call_id"] == "call-product-detail"
            assert json.loads(history[-1]["content"])["id"] == IDS["product_iphone"]
            return AgentPlan(text="model completed with tool result")

    client.app.state.agent_gateway = FixedGateway()
    response = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"message": "custom model request"},
        )
    )
    assert event(response, "text")["text"] == "model accepted"
    assert event(response, "tool_result")["result"]["id"] == IDS["product_iphone"]
    assert [payload["text"] for name, payload in response if name == "text"] == [
        "model accepted",
        "model completed with tool result",
    ]

    knowledge = run_tool(
        client,
        newlife_token,
        tool="knowledge_search",
        input={"query": "Hong Kong", "page_size": 5},
    )
    assert event(knowledge, "tool_result")["result"]["results"][0]["type"] == "workspace_profile"


def test_agent_resumes_model_after_approved_write_tool(
    client: TestClient,
    newlife_token: str,
):
    class ApprovalGateway:
        calls = 0

        async def plan(self, *, message: str, history: list[dict]) -> AgentPlan:
            self.calls += 1
            if self.calls == 1:
                assert message == "更新商品说明"
                return AgentPlan(
                    tool_calls=(
                        ToolCall(
                            name="product_update",
                            arguments={
                                "product_id": IDS["product_iphone"],
                                "description": "Updated after model approval",
                            },
                            execution_key="call-approved-product-update",
                        ),
                    )
                )
            assert message == ""
            tool_message = history[-1]
            assert tool_message["role"] == "tool"
            assert tool_message["tool_call_id"] == "call-approved-product-update"
            assert json.loads(tool_message["content"])["updated"]["description"] == (
                "Updated after model approval"
            )
            return AgentPlan(text="商品说明已经更新。")

    gateway = ApprovalGateway()
    client.app.state.agent_gateway = gateway
    requested = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"message": "更新商品说明"},
        )
    )
    assert gateway.calls == 1
    assert not any(name == "tool_result" for name, _payload in requested)
    conversation_id = event(requested, "conversation")["conversation_id"]
    approved = approve(
        client,
        newlife_token,
        conversation_id,
        event(requested, "approval_card"),
    )
    assert gateway.calls == 2
    assert event(approved, "tool_result")["result"]["updated"]["description"] == (
        "Updated after model approval"
    )
    assert event(approved, "text")["text"] == "商品说明已经更新。"


def test_agent_result_unknown_can_be_reconciled_without_reexecuting_unsafe_tool(
    client: TestClient,
    newlife_token: str,
    monkeypatch,
):
    async def fail_after_dispatch(**kwargs):
        del kwargs
        raise RuntimeError("private execution failure")

    monkeypatch.setattr("app.modules.agent.service.execute_tool", fail_after_dispatch)
    failed = run_tool(client, newlife_token, tool="lead_count_by_stage")
    failure = event(failed, "error")
    assert failure["code"] == "TOOL_RESULT_UNKNOWN"
    conversation_id = event(failed, "conversation")["conversation_id"]
    reconciled = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "resolve_agent_execution",
                    "execution_id": failure["execution_id"],
                    "resolution": "mark_failed",
                    "confirmed": True,
                },
            },
        )
    )
    assert event(reconciled, "tool_result")["result"] == {"failed": True}


def test_agent_internal_gateway_and_tool_errors_are_redacted_from_sse(
    client: TestClient,
    newlife_token: str,
):
    class FailingGateway:
        async def plan(self, *, message: str, history: list[dict]) -> AgentPlan:
            del message, history
            raise RuntimeError("private-secret-path /Users/ray/internal.py")

    client.app.state.agent_gateway = FailingGateway()
    failed = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"message": "force private failure"},
        )
    )
    body = json.dumps(failed)
    assert event(failed, "error")["code"] == "AGENT_INTERNAL_ERROR"
    assert "private-secret-path" not in body
    assert "/Users/" not in body
    assert "traceback" not in body.lower()

    invalid = run_tool(
        client,
        newlife_token,
        tool="product_get_detail",
        input={"product_id": "private-database-id"},
    )
    assert event(invalid, "error")["code"] == "TOOL_VALIDATION_FAILED"
    assert "Product not found" not in json.dumps(invalid)


def test_deterministic_agent_routes_supplier_recommended_questions(
    client: TestClient,
    newlife_token: str,
):
    cases = (
        ("有多少条线索？", "lead_count_by_stage", {}),
        ("各阶段的线索分布情况", "lead_count_by_stage", {}),
        ("日本市场有哪些线索？", "lead_list_leads", {"country": "JP"}),
        ("帮我看看最新的一条线索", "lead_list_leads", {"page_size": 1}),
        ("有哪些商品？", "product_list_products", {}),
        ("查看库存", "product_list_skus", {}),
    )

    responses = {}
    for message, expected_tool, expected_input in cases:
        events = parse_sse(
            client.post(
                agent_url(),
                headers=auth_header(newlife_token),
                json={"message": message},
            )
        )
        tool_call = event(events, "tool_call")
        assert tool_call["tool"] == expected_tool
        assert tool_call["input"] == expected_input
        responses[message] = events

    count_texts = [
        payload["text"]
        for name, payload in responses["有多少条线索？"]
        if name == "text"
    ]
    assert any("当前工作区共有 3 条线索" in text for text in count_texts)
    assert all("我可以查询线索、商品和库存" not in text for text in count_texts)


def test_paused_onboarding_conversation_answers_normal_questions(
    client: TestClient,
    newlife_token: str,
):
    resumed = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"action": {"type": "resume_onboarding"}},
        )
    )
    conversation_id = event(resumed, "conversation")["conversation_id"]

    parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"conversation_id": conversation_id, "message": "Test Supplier"},
        )
    )
    paused = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {"type": "pause_onboarding"},
            },
        )
    )
    assert event(paused, "onboarding_context")["status"] == "paused"

    auto_resumed = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {"type": "resume_onboarding"},
            },
        )
    )
    assert event(auto_resumed, "onboarding_context")["status"] == "paused"

    answered = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"conversation_id": conversation_id, "message": "有多少条线索？"},
        )
    )
    assert event(answered, "tool_call")["tool"] == "lead_count_by_stage"
    assert any(name == "text" and payload.get("text") for name, payload in answered)


def test_onboarding_welcome_is_only_shown_on_first_auto_resume(
    client: TestClient,
    newlife_token: str,
):
    first = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"action": {"type": "resume_onboarding"}},
        )
    )
    assert event(first, "onboarding_context")["status"] == "not_started"
    assert any(
        name == "text" and "欢迎使用 Mekyro" in payload.get("text", "")
        for name, payload in first
    )

    repeated = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"action": {"type": "resume_onboarding"}},
        )
    )
    assert event(repeated, "onboarding_context")["status"] == "paused"


def test_deterministic_agent_explains_how_to_acquire_new_leads(
    client: TestClient,
    newlife_token: str,
):
    events = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"message": "那么我想获得二手手机的线索怎么办"},
        )
    )
    assert all(name != "tool_call" for name, _ in events)
    texts = [payload["text"] for name, payload in events if name == "text"]
    assert any("目标国家" in text and "二手手机" not in text for text in texts)
    assert all("已查询到" not in text for text in texts)


def test_abandoned_onboarding_stays_hidden_after_auto_resume(
    client: TestClient,
    newlife_token: str,
):
    resumed = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"action": {"type": "resume_onboarding"}},
        )
    )
    conversation_id = event(resumed, "conversation")["conversation_id"]
    abandoned = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {"type": "abandon_onboarding", "confirmed": True},
            },
        )
    )
    assert event(abandoned, "onboarding_context")["status"] == "paused"

    auto_resumed = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={
                "conversation_id": conversation_id,
                "action": {"type": "resume_onboarding"},
            },
        )
    )
    assert event(auto_resumed, "onboarding_context")["status"] == "paused"


def test_deterministic_agent_answers_usage_and_write_operation_questions(
    client: TestClient,
    newlife_token: str,
):
    cases = (
        ("怎么使用呢", ("自然语言", "有多少条线索")),
        ("可以啊，怎么实现触发业务写操作", ("对象 + 动作", "明确确认")),
    )
    for message, expected_phrases in cases:
        events = parse_sse(
            client.post(
                agent_url(),
                headers=auth_header(newlife_token),
                json={"message": message},
            )
        )
        texts = [payload["text"] for name, payload in events if name == "text"]
        assert any(all(phrase in text for phrase in expected_phrases) for text in texts)
        assert all("我可以查询线索、商品和库存" not in text for text in texts)


def test_deterministic_agent_requests_required_fields_before_creating_lead(
    client: TestClient,
    newlife_token: str,
):
    events = parse_sse(
        client.post(
            agent_url(),
            headers=auth_header(newlife_token),
            json={"message": "新增一个线索"},
        )
    )
    assert all(name != "tool_call" for name, _ in events)
    texts = [payload["text"] for name, payload in events if name == "text"]
    assert any("公司名称" in text and "国家代码" in text for text in texts)
    assert all("已查询到" not in text for text in texts)
