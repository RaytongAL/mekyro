import asyncio

from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def login(client: TestClient, username: str, password: str = "Mekyro123!") -> tuple[str, dict]:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return token, response.json()["user"]


def test_user_language_profile_and_workspace_prompt_are_audited(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    language = client.put("/api/v1/auth/me/language", headers=headers, json={"language": "en-US"})
    assert language.status_code == 200
    assert language.json() == {"language": "en-US"}

    profile = client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={
            "nickname": "Ray Workspace Admin",
            "country_code": "+852",
            "phone": "+85290000001",
            "avatar": "https://cdn.example/ray.png",
        },
    )
    assert profile.status_code == 200
    assert profile.json()["nickname"] == "Ray Workspace Admin"
    assert profile.json()["phone"] == "+85290000001"
    assert profile.json()["language"] == "en-US"

    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    prompt = client.get(f"{base}/prompt", headers=headers)
    assert prompt.status_code == 200
    assert prompt.json()["version"] == 1
    updated_prompt = client.put(
        f"{base}/prompt",
        headers=headers,
        json={"prompt": "Use concise B2B English.", "daily_lead_limit": 25},
    )
    assert updated_prompt.status_code == 200
    assert updated_prompt.json()["version"] == 2
    assert updated_prompt.json()["daily_lead_limit"] == 25
    versions = client.get(f"{base}/prompt/versions", headers=headers)
    assert versions.status_code == 200
    assert [item["version"] for item in versions.json()] == [1, 2]

    detail = client.get(base, headers=headers)
    assert detail.status_code == 200
    assert detail.json()["prompt"] == "Use concise B2B English."
    assert detail.json()["email_outreach_enabled"] is True
    assert detail.json()["onboarding_status"] == "not_started"
    profile_update = client.patch(
        base,
        headers=headers,
        json={
            "description": "Updated supplier profile",
            "lead_acquisition_requirement": "European mobile distributors",
            "email_outreach_enabled": False,
        },
    )
    assert profile_update.status_code == 200
    assert profile_update.json()["description"] == "Updated supplier profile"
    assert profile_update.json()["lead_acquisition_requirement"] == "European mobile distributors"
    assert profile_update.json()["email_outreach_enabled"] is False

    duplicate_email = client.patch(
        "/api/v1/auth/me",
        headers=headers,
        json={"email": "owner@aurora.example"},
    )
    assert duplicate_email.status_code == 409


def test_supplier_profile_migrates_legacy_requirement_and_protects_active_execution(
    client: TestClient,
    newlife_token: str,
):
    workspace_id = IDS["workspace_newlife"]
    base = f"/api/v1/workspaces/{workspace_id}"
    headers = auth_header(newlife_token)

    async def set_state(state: dict, requirement: str = "") -> None:
        async with client.app.state.database.sessions() as session:
            from app.core.models import Workspace

            workspace = await session.get(Workspace, workspace_id)
            assert workspace is not None
            workspace.onboarding_state = state
            workspace.lead_acquisition_requirement = requirement
            await session.commit()

    async def read_state() -> tuple[dict, str]:
        async with client.app.state.database.sessions() as session:
            from app.core.models import Workspace

            workspace = await session.get(Workspace, workspace_id)
            assert workspace is not None
            return workspace.onboarding_state, workspace.lead_acquisition_requirement

    legacy_state = {
        "schema_version": 2,
        "status": "completed",
        "current_step": "done",
        "steps": {
            "profile": {"status": "confirmed", "answers": {"confirmed": True}},
            "site": {"status": "confirmed", "answers": {"confirmed": True}},
            "leads": {
                "status": "confirmed",
                "answers": {
                    "requirement_description": "Long-term European distributor sourcing"
                },
            },
        },
    }
    asyncio.run(set_state(legacy_state))

    onboarding = client.get(f"{base}/onboarding", headers=headers)
    detail = client.get(base, headers=headers)
    assert onboarding.status_code == 200
    assert onboarding.json()["schema_version"] == 5
    assert onboarding.json()["status"] == "completed"
    assert (
        onboarding.json()["lead_acquisition_requirement"]
        == "Long-term European distributor sourcing"
    )
    assert (
        detail.json()["lead_acquisition_requirement"]
        == "Long-term European distributor sourcing"
    )

    active_state = onboarding.json()
    active_state["lead_acquisition_requirement"] = "Original long-term requirement"
    active_state["steps"]["leads"]["execution"] = {
        "attempt_id": "active-attempt",
        "card_id": "active-card",
        "kind": "lead_requirement",
        "tool": "lead_count_by_stage",
        "status": "processing",
    }
    asyncio.run(set_state(active_state, "Original long-term requirement"))

    conflict = client.patch(
        base,
        headers=headers,
        json={"lead_acquisition_requirement": "Changed during execution"},
    )
    assert conflict.status_code == 409
    stored_state, stored_requirement = asyncio.run(read_state())
    assert stored_requirement == "Original long-term requirement"
    assert stored_state["steps"]["leads"]["execution"]["status"] == "processing"

    unchanged = client.patch(
        base,
        headers=headers,
        json={"lead_acquisition_requirement": "  Original long-term requirement  "},
    )
    assert unchanged.status_code == 200
    assert unchanged.json()["lead_acquisition_requirement"] == "Original long-term requirement"


def test_supplier_profile_requirement_change_invalidates_pending_lead_card(
    client: TestClient,
    newlife_token: str,
):
    workspace_id = IDS["workspace_newlife"]
    base = f"/api/v1/workspaces/{workspace_id}"
    headers = auth_header(newlife_token)

    async def seed_pending_card() -> None:
        async with client.app.state.database.sessions() as session:
            from app.core.models import Workspace
            from app.modules.workspaces.onboarding_router import normalize_state

            workspace = await session.get(Workspace, workspace_id)
            assert workspace is not None
            state = normalize_state(workspace.onboarding_state)
            state["lead_acquisition_requirement"] = "Old requirement"
            state["status"] = "in_progress"
            state["current_step"] = "leads"
            state["steps"]["profile"].update(
                {"status": "confirmed", "answers": {"confirmed": True}}
            )
            state["steps"]["site"].update(
                {"status": "confirmed", "answers": {"confirmed": True}}
            )
            state["steps"]["leads"].update(
                {
                    "status": "draft",
                    "answers": {"requirement_description": "Pending draft"},
                    "pending_card": {
                        "card_id": "stale-lead-card",
                        "step": "leads",
                        "kind": "lead_requirement",
                    },
                    "execution": None,
                }
            )
            workspace.onboarding_state = state
            workspace.lead_acquisition_requirement = "Old requirement"
            await session.commit()

    async def read_state() -> dict:
        async with client.app.state.database.sessions() as session:
            from app.core.models import Workspace

            workspace = await session.get(Workspace, workspace_id)
            assert workspace is not None
            return workspace.onboarding_state

    asyncio.run(seed_pending_card())
    response = client.patch(
        base,
        headers=headers,
        json={"lead_acquisition_requirement": "  New durable requirement  "},
    )
    assert response.status_code == 200
    assert response.json()["lead_acquisition_requirement"] == "New durable requirement"
    state = asyncio.run(read_state())
    assert state["lead_acquisition_requirement"] == "New durable requirement"
    assert state["steps"]["leads"]["pending_card"] is None
    assert state["steps"]["leads"]["answers"] == {}
    assert state["steps"]["leads"]["status"] == "pending"


def test_platform_supplier_account_detail_update_deactivate_reactivate_and_hard_delete(
    client: TestClient,
    ops_token: str,
):
    ops_headers = auth_header(ops_token)
    detail = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/supplier-account",
        headers=ops_headers,
    )
    assert detail.status_code == 200
    assert detail.json()["owner"]["username"] == "newlife"

    updated = client.patch(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/supplier-account",
        headers=ops_headers,
        json={
            "workspace_name": "New Life Refurbished Supply",
            "owner_display_name": "Ray Chen Updated",
            "owner_phone": "+85290000002",
            "prompt": "Never promise unverified inventory.",
            "daily_lead_limit": 40,
            "vendure_url": "https://store.newlife.example",
            "vendure_channels_token": "secret-channel-token",
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["workspace"]["name"] == "New Life Refurbished Supply"
    assert body["workspace"]["vendure_channels_token_configured"] is True
    assert body["workspace"]["vendure_channels_token_masked"].endswith("oken")
    assert "secret-channel-token" not in updated.text
    assert body["owner"]["display_name"] == "Ray Chen Updated"

    inactive = client.patch(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/supplier-account",
        headers=ops_headers,
        json={"workspace_is_active": False},
    )
    assert inactive.status_code == 200
    assert inactive.json()["workspace"]["is_active"] is False
    failed_login = client.post(
        "/api/v1/auth/login",
        json={"username": "newlife", "password": "Mekyro123!"},
    )
    assert failed_login.status_code == 401
    active_only = client.get("/api/v1/workspaces", headers=ops_headers)
    assert active_only.status_code == 200
    assert IDS["workspace_newlife"] not in {
        item["id"] for item in active_only.json()["items"]
    }
    including_inactive = client.get(
        "/api/v1/workspaces?include_inactive=true&ordering=name&limit=100",
        headers=ops_headers,
    )
    assert including_inactive.status_code == 200
    inactive_workspace = next(
        item
        for item in including_inactive.json()["items"]
        if item["id"] == IDS["workspace_newlife"]
    )
    assert inactive_workspace["is_active"] is False

    active = client.patch(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/supplier-account",
        headers=ops_headers,
        json={"workspace_is_active": True},
    )
    assert active.status_code == 200
    relogin, _ = login(client, "newlife")
    assert relogin

    registration = client.post(
        "/api/v1/workspaces",
        headers=ops_headers,
        json={
            "username": "harddelete-owner",
            "email": "harddelete@example.com",
            "display_name": "Hard Delete Owner",
            "password": "HardDelete123!",
            "workspace_name": "Hard Delete Workspace",
            "workspace_slug": "hard-delete-workspace",
        },
    )
    assert registration.status_code == 201
    deleted_workspace_id = registration.json()["workspace_id"]
    deleted = client.delete(
        f"/api/v1/workspaces/{deleted_workspace_id}/supplier-account?hard=true",
        headers=ops_headers,
    )
    assert deleted.status_code == 204
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "harddelete-owner", "password": "HardDelete123!"},
        ).status_code
        == 401
    )
    assert (
        client.get(
            f"/api/v1/workspaces/{deleted_workspace_id}/supplier-account",
            headers=ops_headers,
        ).status_code
        == 404
    )


def test_member_invitation_acceptance_roles_and_last_owner_guard(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    owner_headers = auth_header(newlife_token)
    invitation = client.post(
        f"{base}/members/invitations",
        headers=owner_headers,
        json={"email": "owner@aurora.example", "role": "member"},
    )
    assert invitation.status_code == 201
    invite_token = invitation.json()["invite_token"]
    assert (
        "invite_token" not in client.get(f"{base}/members/invitations", headers=owner_headers).text
    )

    _, aurora_user = login(client, "aurora")
    wrong_accept = client.post(
        "/api/v1/workspace-invitations/accept",
        headers=owner_headers,
        json={"invite_token": invite_token},
    )
    assert wrong_accept.status_code == 403
    aurora_token, _ = login(client, "aurora")
    accepted = client.post(
        "/api/v1/workspace-invitations/accept",
        headers=auth_header(aurora_token),
        json={"invite_token": invite_token},
    )
    assert accepted.status_code == 200
    assert accepted.json()["membership"]["role"] == "member"
    replay = client.post(
        "/api/v1/workspace-invitations/accept",
        headers=auth_header(aurora_token),
        json={"invite_token": invite_token},
    )
    assert replay.status_code == 200
    assert replay.json()["idempotent"] is True

    members = client.get(f"{base}/members", headers=owner_headers)
    assert {item["username"] for item in members.json()} == {"newlife", "aurora"}
    aurora_member_id = aurora_user["id"]
    promoted = client.patch(
        f"{base}/members/{aurora_member_id}",
        headers=owner_headers,
        json={"role": "admin", "name": "Aurora Admin"},
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "admin"

    admin_headers = auth_header(aurora_token)
    created_lead = client.post(
        f"{base}/leads",
        headers=admin_headers,
        json={
            "source": "manual",
            "external_ref": "AURORA-ADMIN-001",
            "merchant_name": "Admin Created Buyer",
            "company_name": "Admin Created Buyer Ltd",
            "country": "GB",
        },
    )
    assert created_lead.status_code == 201
    owner_invite = client.post(
        f"{base}/members/invitations",
        headers=admin_headers,
        json={"email": "new-owner@example.com", "role": "owner"},
    )
    assert owner_invite.status_code == 403
    revoke_invite = client.post(
        f"{base}/members/invitations",
        headers=owner_headers,
        json={"email": "revoke-me@example.com", "role": "member"},
    )
    assert revoke_invite.status_code == 201
    assert (
        client.delete(
            f"{base}/members/invitations/{revoke_invite.json()['id']}",
            headers=owner_headers,
        ).status_code
        == 204
    )
    invitations = client.get(f"{base}/members/invitations", headers=owner_headers)
    assert any(item["status"] == "revoked" for item in invitations.json())

    demoted = client.patch(
        f"{base}/members/{aurora_member_id}",
        headers=owner_headers,
        json={"role": "member"},
    )
    assert demoted.status_code == 200
    removed = client.delete(f"{base}/members/{aurora_member_id}", headers=owner_headers)
    assert removed.status_code == 204
    last_owner = client.patch(
        f"{base}/members/{IDS['user_newlife']}",
        headers=owner_headers,
        json={"role": "admin"},
    )
    assert last_owner.status_code == 409


def test_onboarding_three_steps_apply_confirm_pause_back_restart_and_finish(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}/onboarding"
    headers = auth_header(newlife_token)
    initial = client.get(base, headers=headers)
    assert initial.status_code == 200
    assert initial.json()["status"] == "not_started"
    started = client.post(f"{base}/start", headers=headers)
    assert started.status_code == 200
    assert started.json()["current_step"] == "profile"

    draft_profile = client.put(
        f"{base}/steps/profile/draft",
        headers=headers,
        json={"answers": {"name": "New Life Global", "description": "CPO mobile exporter"}},
    )
    assert draft_profile.status_code == 200
    profile_card = draft_profile.json()["steps"]["profile"]["pending_card"]["card_id"]
    before_confirm = client.post(
        f"{base}/steps/profile/confirm", headers=headers, json={"confirmed": True}
    )
    assert before_confirm.status_code == 409
    applied_profile = client.post(
        f"{base}/steps/profile/apply",
        headers=headers,
        json={"card_id": profile_card},
    )
    assert applied_profile.status_code == 200
    assert applied_profile.json()["steps"]["profile"]["pending_card"] is None
    confirmed_profile = client.post(
        f"{base}/steps/profile/confirm", headers=headers, json={"confirmed": True}
    )
    assert confirmed_profile.status_code == 200
    assert confirmed_profile.json()["current_step"] == "site"

    site_draft = client.put(
        f"{base}/steps/site/draft",
        headers=headers,
        json={"answers": {"site_type": "independent", "vendure_url": "https://newlife.example"}},
    )
    assert site_draft.status_code == 200
    paused = client.post(f"{base}/pause", headers=headers)
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"
    assert (
        client.put(
            f"{base}/steps/site/draft",
            headers=headers,
            json={"answers": {"site_type": "independent", "vendure_url": "https://other.example"}},
        ).status_code
        == 409
    )
    continued = client.post(f"{base}/continue", headers=headers)
    assert continued.status_code == 200
    backed = client.post(f"{base}/back", headers=headers)
    assert backed.status_code == 200
    assert backed.json()["current_step"] == "profile"
    assert (
        backed.json()["steps"]["site"]["pending_card"]["card_id"]
        == site_draft.json()["steps"]["site"]["pending_card"]["card_id"]
    )

    restarted = client.post(f"{base}/restart", headers=headers, json={"confirmed": True})
    assert restarted.status_code == 200
    assert restarted.json()["status"] == "not_started"
    assert restarted.json()["current_step"] == "profile"
    assert (
        client.post(f"{base}/finish", headers=headers, json={"confirmed": True}).status_code == 409
    )

    # Complete the flow a second time, including every formal card application.
    client.post(f"{base}/start", headers=headers)
    profile = client.put(
        f"{base}/steps/profile/draft",
        headers=headers,
        json={"answers": {"name": "New Life Global", "description": "CPO mobile exporter"}},
    ).json()
    client.post(
        f"{base}/steps/profile/apply",
        headers=headers,
        json={"card_id": profile["steps"]["profile"]["pending_card"]["card_id"]},
    )
    client.post(f"{base}/steps/profile/confirm", headers=headers, json={"confirmed": True})
    site = client.put(
        f"{base}/steps/site/draft",
        headers=headers,
        json={"answers": {"site_type": "shopify", "vendure_url": ""}},
    ).json()
    client.post(
        f"{base}/steps/site/apply",
        headers=headers,
        json={"card_id": site["steps"]["site"]["pending_card"]["card_id"]},
    )
    client.post(f"{base}/steps/site/confirm", headers=headers, json={"confirmed": True})
    leads = client.put(
        f"{base}/steps/leads/draft",
        headers=headers,
        json={"answers": {"requirement_description": "European CPO distributors"}},
    ).json()
    client.post(
        f"{base}/steps/leads/apply",
        headers=headers,
        json={"card_id": leads["steps"]["leads"]["pending_card"]["card_id"]},
    )
    completed = client.post(
        f"{base}/steps/leads/confirm", headers=headers, json={"confirmed": True}
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"
    finished = client.post(f"{base}/finish", headers=headers, json={"confirmed": True})
    assert finished.status_code == 200
    assert finished.json()["completion_acknowledged"] is True
    assert (
        client.post(f"{base}/finish", headers=headers, json={"confirmed": True}).json()[
            "completion_acknowledged"
        ]
        is True
    )

    workspace = client.get(f"/api/v1/workspaces/{IDS['workspace_newlife']}", headers=headers)
    assert workspace.json()["name"] == "New Life Global"
    assert workspace.json()["lead_acquisition_requirement"] == "European CPO distributors"
