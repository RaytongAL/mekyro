from fastapi.testclient import TestClient

from tests.conftest import auth_header

REGISTRATION = {
    "username": "northstar",
    "email": "owner@northstar.example",
    "display_name": "Northstar Owner",
    "password": "Northstar123!",
    "workspace_name": "Northstar Components",
    "workspace_slug": "northstar-components",
    "description": "Export supplier created by platform operations.",
    "site_type": "independent",
}


def test_platform_admin_registers_supplier_that_can_login(
    client: TestClient,
    ops_token: str,
):
    response = client.post(
        "/api/v1/workspaces",
        headers=auth_header(ops_token),
        json=REGISTRATION,
    )
    assert response.status_code == 201
    registration = response.json()

    login = client.post(
        "/api/v1/auth/login",
        json={"username": REGISTRATION["username"], "password": REGISTRATION["password"]},
    )
    assert login.status_code == 200
    supplier_headers = auth_header(login.json()["access_token"])

    workspaces = client.get("/api/v1/workspaces", headers=supplier_headers)
    assert workspaces.status_code == 200
    assert workspaces.json()["total"] == 1
    assert [item["id"] for item in workspaces.json()["items"]] == [
        registration["workspace_id"]
    ]
    assert workspaces.json()["items"][0]["role"] == "owner"

    audit = client.get(
        f"/api/v1/workspaces/{registration['workspace_id']}/audit-logs",
        headers=supplier_headers,
    )
    assert audit.status_code == 200
    assert audit.json()[0]["action"] == "workspace.supplier_registered"


def test_supplier_cannot_register_another_supplier(
    client: TestClient,
    newlife_token: str,
):
    payload = {**REGISTRATION, "username": "forbidden", "email": "forbidden@example.com"}
    payload["workspace_slug"] = "forbidden-workspace"
    response = client.post(
        "/api/v1/workspaces",
        headers=auth_header(newlife_token),
        json=payload,
    )
    assert response.status_code == 403


def test_duplicate_supplier_identity_is_rejected(client: TestClient, ops_token: str):
    duplicate_registration = {
        **REGISTRATION,
        "username": "duplicatevendor",
        "email": "owner@duplicate.example",
        "workspace_slug": "duplicate-vendor",
    }
    created = client.post(
        "/api/v1/workspaces",
        headers=auth_header(ops_token),
        json=duplicate_registration,
    )
    assert created.status_code == 201

    response = client.post(
        "/api/v1/workspaces",
        headers=auth_header(ops_token),
        json={**duplicate_registration, "workspace_slug": "another-workspace"},
    )
    assert response.status_code == 409
