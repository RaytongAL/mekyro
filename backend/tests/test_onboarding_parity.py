import asyncio
import json
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.core.models import ShopifyConfig, Workspace
from app.core.secrets import decrypt_secret
from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def _base() -> str:
    return f"/api/v1/workspaces/{IDS['workspace_newlife']}/onboarding"


def _agent_url() -> str:
    return f"/api/v1/workspaces/{IDS['workspace_newlife']}/agent/chat"


def _events(response) -> list[tuple[str, dict]]:
    assert response.status_code == 200
    result = []
    for block in response.text.strip().split("\n\n"):
        lines = block.splitlines()
        result.append((lines[0][7:], json.loads(lines[1][6:])))
    return result


def _event(events: list[tuple[str, dict]], name: str) -> dict:
    return next(payload for event_name, payload in events if event_name == name)


def _advance_to_site(client: TestClient, token: str) -> None:
    headers = auth_header(token)
    base = _base()
    client.post(f"{base}/start", headers=headers)
    profile = client.put(
        f"{base}/steps/profile/draft",
        headers=headers,
        json={"answers": {"name": "Parity Supplier", "description": "Onboarding parity"}},
    ).json()
    card_id = profile["steps"]["profile"]["pending_card"]["card_id"]
    assert client.post(
        f"{base}/steps/profile/apply", headers=headers, json={"card_id": card_id}
    ).status_code == 200
    assert client.post(
        f"{base}/steps/profile/confirm", headers=headers, json={"confirmed": True}
    ).status_code == 200


def test_site_variants_validate_replace_drafts_and_preserve_pending_card_on_back(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = _base()
    _advance_to_site(client, newlife_token)

    incomplete = client.put(
        f"{base}/steps/site/draft",
        headers=headers,
        json={
            "answers": {
                "site_variant": "self_hosted",
                "site_url": "https://supplier.example",
            }
        },
    )
    assert incomplete.status_code == 422
    first = client.put(
        f"{base}/steps/site/draft",
        headers=headers,
        json={
            "answers": {
                "site_variant": "self_hosted",
                "site_url": "https://supplier.example/",
                "site_details": "Next.js with a private product API",
            }
        },
    ).json()
    first_card = first["steps"]["site"]["pending_card"]
    assert first["steps"]["site"]["answers"]["site_type"] == "vendure"
    assert first_card["fields"][0]["value"] == "Mekyro独立站"
    second = client.put(
        f"{base}/steps/site/draft",
        headers=headers,
        json={
            "answers": {
                "site_variant": "none",
            }
        },
    ).json()
    second_card = second["steps"]["site"]["pending_card"]
    assert second["steps"]["site"]["answers"]["site_type"] == "none"
    assert second_card["fields"][0]["value"] == "无"
    assert second_card["replaces_card_id"] == first_card["card_id"]

    backed = client.post(f"{base}/back", headers=headers)
    assert backed.status_code == 200
    state = backed.json()
    assert state["current_step"] == "profile"
    assert state["steps"]["profile"]["pending_card"] is not None
    assert state["steps"]["site"]["pending_card"]["card_id"] == second_card["card_id"]


def test_shopify_onboarding_credentials_are_redacted_revalidated_and_applied_by_agent(
    client: TestClient,
    newlife_token: str,
):
    _advance_to_site(client, newlife_token)
    headers = auth_header(newlife_token)
    store_url = "https://parity-test.myshopify.com"
    api_key = "onboarding-client-id"
    api_secret = "onboarding-client-secret"
    resumed = _events(
        client.post(_agent_url(), headers=headers, json={"action": {"type": "resume_onboarding"}})
    )
    conversation_id = _event(resumed, "conversation")["conversation_id"]
    selected = _events(
        client.post(
            _agent_url(),
            headers=headers,
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "select_onboarding_site",
                    "site_variant": "shopify",
                    "shopify_store_url": store_url,
                    "shopify_api_key": api_key,
                    "shopify_api_secret_key": api_secret,
                },
            },
        )
    )
    card = _event(selected, "onboarding_card")
    serialized = json.dumps(selected)
    assert api_key not in serialized
    assert api_secret not in serialized
    assert card["step"] == "site"

    async def read_config() -> ShopifyConfig | None:
        async with client.app.state.database.sessions() as session:
            return await session.scalar(
                select(ShopifyConfig).where(
                    ShopifyConfig.workspace_id == IDS["workspace_newlife"]
                )
            )

    assert asyncio.run(read_config()) is None
    wrong = _events(
        client.post(
            _agent_url(),
            headers=headers,
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "confirm_onboarding_card",
                    "step": "site",
                    "card_id": card["card_id"],
                    "shopify_store_url": store_url,
                    "shopify_api_key": api_key,
                    "shopify_api_secret_key": "changed-secret",
                },
            },
        )
    )
    assert _event(wrong, "error")["code"] == "ONBOARDING_VALIDATION_FAILED"
    assert asyncio.run(read_config()) is None

    selected_again = _events(
        client.post(
            _agent_url(),
            headers=headers,
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "select_onboarding_site",
                    "site_variant": "shopify",
                    "shopify_store_url": store_url,
                    "shopify_api_key": api_key,
                    "shopify_api_secret_key": api_secret,
                },
            },
        )
    )
    replacement = _event(selected_again, "onboarding_card")
    confirmed = _events(
        client.post(
            _agent_url(),
            headers=headers,
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "confirm_onboarding_card",
                    "step": "site",
                    "card_id": replacement["card_id"],
                    "shopify_store_url": store_url,
                    "shopify_api_key": api_key,
                    "shopify_api_secret_key": api_secret,
                },
            },
        )
    )
    assert _event(confirmed, "onboarding_context")["current_step"] == "leads"
    config = asyncio.run(read_config())
    assert config is not None
    assert config.store_url == store_url
    assert config.is_active is False
    assert decrypt_secret(config.api_key_encrypted, Settings()) == api_key
    assert decrypt_secret(config.api_secret_encrypted, Settings()) == api_secret


def test_structured_lead_onboarding_builds_lead_agent_prompt(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = _base()
    _advance_to_site(client, newlife_token)
    site = client.put(
        f"{base}/steps/site/draft",
        headers=headers,
        json={
            "answers": {
                "site_variant": "self_hosted",
                "site_url": "https://supplier.example",
                "site_details": "Next.js storefront",
            }
        },
    ).json()
    site_card_id = site["steps"]["site"]["pending_card"]["card_id"]
    assert client.post(
        f"{base}/steps/site/apply", headers=headers, json={"card_id": site_card_id}
    ).status_code == 200
    assert client.post(
        f"{base}/steps/site/confirm", headers=headers, json={"confirmed": True}
    ).status_code == 200

    async def read_site_type() -> str:
        async with client.app.state.database.sessions() as session:
            workspace = await session.get(Workspace, IDS["workspace_newlife"])
            assert workspace is not None
            return workspace.site_type

    assert asyncio.run(read_site_type()) == "vendure"

    draft = client.put(
        f"{base}/steps/leads/draft",
        headers=headers,
        json={
            "answers": {
                "target_industry": "二手及翻新手机",
                "target_subject": "批发商、分销商和零售商",
                "target_countries": "英国、德国、美国",
                "customer_features": "经营二手手机并有公开批发或采购场景",
                "product_whitelist": "iPhone 15\nSamsung Galaxy S24",
                "exclusions": "个人卖家\n目录和资讯站",
                "contact_requirements": "公开 Email 或 WhatsApp 任意一种即可。",
            }
        },
    )
    assert draft.status_code == 200
    card = draft.json()["steps"]["leads"]["pending_card"]
    assert card["title"] == "公开线索发现配置预览"
    assert {field["key"] for field in card["fields"]} >= {
        "target_industry",
        "target_subject",
        "product_whitelist",
    }
    assert client.post(
        f"{base}/steps/leads/apply",
        headers=headers,
        json={"card_id": card["card_id"]},
    ).status_code == 200

    async def read_prompt() -> str:
        async with client.app.state.database.sessions() as session:
            workspace = await session.get(Workspace, IDS["workspace_newlife"])
            assert workspace is not None
            return workspace.prompt

    prompt = asyncio.run(read_prompt())
    for section in (
        "【目标行业】",
        "【目标主体】",
        "【目标国家或地区】",
        "【目标客户特征】",
        "【我方产品白名单】",
        "【排除对象】",
        "【联系方式要求】",
        "【输出语言】",
        "【质量要求】",
    ):
        assert section in prompt
    assert "- iPhone 15" in prompt
    assert "- Samsung Galaxy S24" in prompt


def test_abandon_requires_confirmation_and_resets_only_onboarding_state(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    workspace_url = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    updated = client.patch(
        workspace_url,
        headers=headers,
        json={"lead_acquisition_requirement": "Durable European buyer requirement"},
    )
    assert updated.status_code == 200
    _advance_to_site(client, newlife_token)
    resumed = _events(
        client.post(_agent_url(), headers=headers, json={"action": {"type": "resume_onboarding"}})
    )
    conversation_id = _event(resumed, "conversation")["conversation_id"]
    rejected = _events(
        client.post(
            _agent_url(),
            headers=headers,
            json={
                "conversation_id": conversation_id,
                "action": {"type": "abandon_onboarding", "confirmed": False},
            },
        )
    )
    assert _event(rejected, "error")["code"] == "ONBOARDING_VALIDATION_FAILED"
    assert client.get(_base(), headers=headers).json()["status"] == "in_progress"

    abandoned = _events(
        client.post(
            _agent_url(),
            headers=headers,
            json={
                "conversation_id": conversation_id,
                "action": {"type": "abandon_onboarding", "confirmed": True},
            },
        )
    )
    assert _event(abandoned, "onboarding_context")["status"] == "paused"
    workspace = client.get(workspace_url, headers=headers).json()
    assert workspace["name"] == "Parity Supplier"
    assert workspace["description"] == "Onboarding parity"
    assert workspace["lead_acquisition_requirement"] == "Durable European buyer requirement"


def test_legacy_lead_readiness_card_remains_confirmable(
    client: TestClient,
    newlife_token: str,
):
    async def seed_legacy_state() -> None:
        async with client.app.state.database.sessions() as session:
            workspace = await session.get(Workspace, IDS["workspace_newlife"])
            state = json.loads(json.dumps(workspace.onboarding_state))
            state["status"] = "in_progress"
            state["current_step"] = "leads"
            for step in ("profile", "site"):
                state["steps"][step].update(
                    {"status": "confirmed", "answers": {"confirmed": True}}
                )
            state["steps"]["leads"].update(
                {
                    "status": "draft",
                    "answers": {"total": 0, "stats": []},
                    "pending_card": {
                        "card_id": "legacy-leads-card",
                        "step": "leads",
                        "kind": "leads_readiness",
                        "title": "Legacy readiness",
                        "fields": [],
                    },
                }
            )
            workspace.onboarding_state = state
            await session.commit()

    asyncio.run(seed_legacy_state())
    headers = auth_header(newlife_token)
    applied = client.post(
        f"{_base()}/steps/leads/apply",
        headers=headers,
        json={"card_id": "legacy-leads-card"},
    )
    assert applied.status_code == 200
    item = applied.json()["steps"]["leads"]["recent_applied_items"][-1]
    assert item["lead_count_by_stage"] == {"contacting": 1, "new": 1, "qualified": 1}
    confirmed = client.post(
        f"{_base()}/steps/leads/confirm",
        headers=headers,
        json={"confirmed": True},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "completed"


def test_long_term_requirement_prefills_lead_review_card_on_resume(
    client: TestClient,
    newlife_token: str,
):
    requirement = "Existing long-term distributor sourcing requirement"

    async def seed_lead_step() -> None:
        async with client.app.state.database.sessions() as session:
            workspace = await session.get(Workspace, IDS["workspace_newlife"])
            state = json.loads(json.dumps(workspace.onboarding_state))
            for step in ("profile", "site"):
                state["steps"][step].update(
                    {"status": "confirmed", "answers": {"confirmed": True}}
                )
            state["status"] = "in_progress"
            state["current_step"] = "leads"
            state["lead_acquisition_requirement"] = requirement
            workspace.onboarding_state = state
            workspace.lead_acquisition_requirement = requirement
            await session.commit()

    asyncio.run(seed_lead_step())
    resumed = _events(
        client.post(
            _agent_url(),
            headers=auth_header(newlife_token),
            json={"action": {"type": "resume_onboarding"}},
        )
    )
    card = _event(resumed, "onboarding_card")
    assert card["kind"] == "lead_requirement"
    assert card["fields"][0]["value"] == requirement
    state = client.get(_base(), headers=auth_header(newlife_token)).json()
    assert state["steps"]["leads"]["answers"]["requirement_description"] == requirement


def test_stale_onboarding_execution_is_redacted_and_auto_reconciled(
    client: TestClient,
    newlife_token: str,
):
    async def seed_stale_execution() -> None:
        async with client.app.state.database.sessions() as session:
            workspace = await session.get(Workspace, IDS["workspace_newlife"])
            state = json.loads(json.dumps(workspace.onboarding_state))
            state["status"] = "in_progress"
            state["current_step"] = "profile"
            state["steps"]["profile"].update(
                {
                    "status": "draft",
                    "answers": {
                        "name": workspace.name,
                        "description": workspace.description,
                    },
                    "pending_card": {
                        "card_id": "stale-profile-card",
                        "step": "profile",
                        "kind": "profile",
                        "operation": {
                            "tool": "config_update_profile",
                            "input": {"private": "must-not-leak"},
                        },
                    },
                    "execution": {
                        "card_id": "stale-profile-card",
                        "status": "processing",
                        "started_at": (
                            datetime.now(UTC) - timedelta(minutes=11)
                        ).isoformat(),
                    },
                }
            )
            workspace.onboarding_state = state
            await session.commit()

    asyncio.run(seed_stale_execution())
    response = client.get(_base(), headers=auth_header(newlife_token))
    assert response.status_code == 200
    state = response.json()
    assert "must-not-leak" not in response.text
    assert state["steps"]["profile"]["status"] == "confirmed"
    assert state["steps"]["profile"]["pending_card"] is None
    assert state["steps"]["profile"]["execution"] is None
    assert state["steps"]["profile"]["recent_applied_items"][-1]["status"] == "auto_reconciled"
    assert state["current_step"] == "site"


def test_unmatched_unknown_onboarding_execution_cannot_be_retried(
    client: TestClient,
    newlife_token: str,
):
    async def seed_unknown_execution() -> None:
        async with client.app.state.database.sessions() as session:
            workspace = await session.get(Workspace, IDS["workspace_newlife"])
            state = json.loads(json.dumps(workspace.onboarding_state))
            state["status"] = "in_progress"
            state["current_step"] = "profile"
            state["steps"]["profile"].update(
                {
                    "status": "draft",
                    "answers": {"name": "Not yet written", "description": "Pending"},
                    "pending_card": {
                        "card_id": "unknown-profile-card",
                        "step": "profile",
                        "kind": "profile",
                        "fields": [],
                    },
                    "execution": {
                        "card_id": "unknown-profile-card",
                        "status": "result_unknown",
                        "started_at": datetime.now(UTC).isoformat(),
                    },
                }
            )
            workspace.onboarding_state = state
            await session.commit()

    asyncio.run(seed_unknown_execution())
    headers = auth_header(newlife_token)
    state = client.get(_base(), headers=headers).json()
    assert state["steps"]["profile"]["execution"]["status"] == "result_unknown"
    assert state["steps"]["profile"]["pending_card"]["status"] == "result_unknown"
    assert {
        action["resolution"]
        for action in state["steps"]["profile"]["pending_card"]["actions"]
    } == {"mark_applied", "retry"}
    retried = client.post(
        f"{_base()}/steps/profile/apply",
        headers=headers,
        json={"card_id": "unknown-profile-card"},
    )
    assert retried.status_code == 409


def test_unknown_state_execution_can_be_reset_or_marked_applied_by_agent(
    client: TestClient,
    newlife_token: str,
):
    card_id = "state-unknown-profile-card"

    async def seed_unknown() -> None:
        async with client.app.state.database.sessions() as session:
            workspace = await session.get(Workspace, IDS["workspace_newlife"])
            state = json.loads(json.dumps(workspace.onboarding_state))
            state["status"] = "in_progress"
            state["current_step"] = "profile"
            state["steps"]["profile"].update(
                {
                    "status": "draft",
                    "answers": {"name": "Manually Verified", "description": "Written once"},
                    "pending_card": {
                        "card_id": card_id,
                        "step": "profile",
                        "kind": "profile",
                        "title": "Company profile",
                        "fields": [],
                        "status": "draft",
                        "actions": [],
                    },
                    "execution": {
                        "attempt_id": "legacy-state-attempt",
                        "card_id": card_id,
                        "kind": "profile",
                        "tool": "config_update_profile",
                        "status": "result_unknown",
                        "started_at": datetime.now(UTC).isoformat(),
                    },
                }
            )
            workspace.onboarding_state = state
            await session.commit()

    asyncio.run(seed_unknown())
    headers = auth_header(newlife_token)
    rejected = client.post(
        f"{_base()}/steps/profile/executions/{card_id}/resolve",
        headers=headers,
        json={"resolution": "retry", "confirmed": False},
    )
    assert rejected.status_code == 422

    resumed = _events(
        client.post(_agent_url(), headers=headers, json={"action": {"type": "resume_onboarding"}})
    )
    conversation_id = _event(resumed, "conversation")["conversation_id"]
    unknown_card = _event(resumed, "onboarding_card")
    assert unknown_card["status"] == "result_unknown"
    assert {action["resolution"] for action in unknown_card["actions"]} == {
        "mark_applied",
        "retry",
    }

    retry = _events(
        client.post(
            _agent_url(),
            headers=headers,
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "resolve_onboarding_execution",
                    "step": "profile",
                    "card_id": card_id,
                    "resolution": "retry",
                    "confirmed": True,
                },
            },
        )
    )
    assert _event(retry, "onboarding_card")["status"] == "draft"
    retry_state = client.get(_base(), headers=headers).json()
    assert retry_state["steps"]["profile"]["execution"]["status"] == "retry_ready"

    asyncio.run(seed_unknown())
    reconciled = _events(
        client.post(
            _agent_url(),
            headers=headers,
            json={
                "conversation_id": conversation_id,
                "action": {
                    "type": "resolve_onboarding_execution",
                    "step": "profile",
                    "card_id": card_id,
                    "resolution": "mark_applied",
                    "confirmed": True,
                },
            },
        )
    )
    assert _event(reconciled, "onboarding_context")["current_step"] == "site"
    final_state = client.get(_base(), headers=headers).json()
    profile = final_state["steps"]["profile"]
    assert profile["status"] == "confirmed"
    assert profile["pending_card"] is None
    assert profile["execution"] is None
    assert profile["recent_applied_items"][-1]["status"] == "user_reconciled"
