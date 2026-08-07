import asyncio
import json

from fastapi.testclient import TestClient

from app.core.models import User, WorkspaceMember
from app.core.security import hash_password
from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header

ROLE_PASSWORD = "RoleMatrix123!"
ADMIN_USER_ID = "00000000-0000-0000-0000-000000000011"
MEMBER_USER_ID = "00000000-0000-0000-0000-000000000012"


def _seed_role_users(client: TestClient) -> None:
    async def seed() -> None:
        async with client.app.state.database.sessions() as session:
            session.add_all(
                [
                    User(
                        id=ADMIN_USER_ID,
                        username="matrix-admin",
                        email="matrix-admin@example.com",
                        display_name="Matrix Admin",
                        password_hash=hash_password(ROLE_PASSWORD),
                    ),
                    User(
                        id=MEMBER_USER_ID,
                        username="matrix-member",
                        email="matrix-member@example.com",
                        display_name="Matrix Member",
                        password_hash=hash_password(ROLE_PASSWORD),
                    ),
                ]
            )
            await session.flush()
            session.add_all(
                [
                    WorkspaceMember(
                        workspace_id=IDS["workspace_newlife"],
                        user_id=ADMIN_USER_ID,
                        name="Matrix Admin",
                        role="admin",
                    ),
                    WorkspaceMember(
                        workspace_id=IDS["workspace_newlife"],
                        user_id=MEMBER_USER_ID,
                        name="Matrix Member",
                        role="member",
                    ),
                ]
            )
            await session.commit()

    asyncio.run(seed())


def _login(client: TestClient, username: str, password: str = ROLE_PASSWORD) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _workspace_path(template: str) -> str:
    replacements = {
        "{workspace_id}": IDS["workspace_newlife"],
        "{activity_id}": "ffffffff-ffff-ffff-ffff-fffffffffff1",
        "{category_id}": IDS["category_phones"],
        "{lead_id}": IDS["lead_paris"],
        "{invitation_id}": "ffffffff-ffff-ffff-ffff-fffffffffff2",
        "{user_id}": IDS["user_newlife"],
        "{step}": "profile",
        "{card_id}": "ffffffff-ffff-ffff-ffff-fffffffffff3",
        "{order_id}": IDS["order_newlife_pending"],
        "{shipment_id}": "ffffffff-ffff-ffff-ffff-fffffffffff4",
        "{product_id}": IDS["product_iphone"],
        "{image_id}": "ffffffff-ffff-ffff-ffff-fffffffffff5",
        "{quote_id}": IDS["quote_newlife_draft"],
        "{variant_id}": IDS["variant_iphone_a"],
    }
    result = template
    for placeholder, value in replacements.items():
        result = result.replace(placeholder, value)
    assert "{" not in result, result
    return result


def _workspace_operations(client: TestClient, methods: set[str]):
    for template, operations in sorted(client.app.openapi()["paths"].items()):
        if "/workspaces/{workspace_id}" not in template:
            continue
        for method in sorted(methods.intersection(operations)):
            yield method.upper(), _workspace_path(template)


def _sse_events(response) -> list[tuple[str, dict]]:
    assert response.status_code == 200, response.text
    events = []
    for block in response.text.strip().split("\n\n"):
        lines = block.splitlines()
        events.append((lines[0].removeprefix("event: "), json.loads(lines[1][6:])))
    return events


def test_member_read_and_write_permissions_cover_every_workspace_route(client: TestClient):
    _seed_role_users(client)
    token = _login(client, "matrix-member")
    headers = auth_header(token)

    for method, path in _workspace_operations(client, {"get"}):
        response = client.request(method, path, headers=headers)
        if path.endswith(("/supplier-account", "/members/invitations", "/shopify/sync-jobs")):
            assert response.status_code == 403, (method, path, response.text)
        else:
            assert response.status_code not in {401, 403}, (method, path, response.text)

    for method, path in _workspace_operations(client, {"post", "put", "patch", "delete"}):
        if path.endswith("/agent/chat"):
            continue
        response = client.request(method, path, headers=headers, json={})
        assert response.status_code == 403, (method, path, response.status_code, response.text)


def test_cross_workspace_account_is_denied_by_every_workspace_read_route(client: TestClient):
    aurora_token = _login(client, "aurora", "Mekyro123!")
    headers = auth_header(aurora_token)

    for method, path in _workspace_operations(client, {"get"}):
        response = client.request(method, path, headers=headers)
        assert response.status_code == 403, (method, path, response.status_code, response.text)


def test_admin_business_writes_owner_boundaries_and_member_agent_guard(client: TestClient):
    _seed_role_users(client)
    admin_token = _login(client, "matrix-admin")
    member_token = _login(client, "matrix-member")
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"

    created = client.post(
        f"{base}/leads",
        headers=auth_header(admin_token),
        json={
            "merchant_name": "Admin Created Lead",
            "company_name": "Admin Distribution Ltd",
            "contact_person": "Alex Admin",
            "country": "GB",
        },
    )
    assert created.status_code == 201, created.text
    workspace_update = client.patch(
        base,
        headers=auth_header(admin_token),
        json={"description": "Updated by a Workspace administrator."},
    )
    assert workspace_update.status_code == 200, workspace_update.text
    invitation = client.post(
        f"{base}/members/invitations",
        headers=auth_header(admin_token),
        json={"email": "invited-member@example.com", "role": "member"},
    )
    assert invitation.status_code == 201, invitation.text

    owner_invitation = client.post(
        f"{base}/members/invitations",
        headers=auth_header(admin_token),
        json={"email": "invited-owner@example.com", "role": "owner"},
    )
    assert owner_invitation.status_code == 403
    role_change = client.patch(
        f"{base}/members/{MEMBER_USER_ID}",
        headers=auth_header(admin_token),
        json={"role": "admin"},
    )
    assert role_change.status_code == 403
    owner_removal = client.delete(
        f"{base}/members/{IDS['user_newlife']}",
        headers=auth_header(admin_token),
    )
    assert owner_removal.status_code == 403

    read_events = _sse_events(
        client.post(
            f"{base}/agent/chat",
            headers=auth_header(member_token),
            json={"action": {"type": "run_tool", "tool": "lead_list_leads", "input": {}}},
        )
    )
    assert next(payload for name, payload in read_events if name == "tool_result")["result"][
        "total"
    ] == 4

    write_events = _sse_events(
        client.post(
            f"{base}/agent/chat",
            headers=auth_header(member_token),
            json={
                "action": {
                    "type": "run_tool",
                    "tool": "product_create",
                    "input": {"name": "Forbidden Agent Product"},
                }
            },
        )
    )
    error = next(payload for name, payload in write_events if name == "error")
    assert error["code"] == "WORKSPACE_WRITE_DENIED"
    assert not any(name == "approval_card" for name, _ in write_events)
    products = client.get(f"{base}/products?search=Forbidden%20Agent", headers=auth_header(member_token))
    assert products.status_code == 200
    assert products.json()["total"] == 0
