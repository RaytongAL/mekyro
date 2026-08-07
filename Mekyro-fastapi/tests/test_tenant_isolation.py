from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def test_supplier_only_lists_own_workspace(client: TestClient, newlife_token: str):
    response = client.get("/api/v1/workspaces", headers=auth_header(newlife_token))
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert [item["id"] for item in response.json()["items"]] == [
        IDS["workspace_newlife"]
    ]


def test_platform_admin_lists_all_workspaces(client: TestClient, ops_token: str):
    response = client.get(
        "/api/v1/workspaces?ordering=name&limit=1&offset=1",
        headers=auth_header(ops_token),
    )
    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert response.json()["limit"] == 1
    assert response.json()["offset"] == 1
    assert [item["id"] for item in response.json()["items"]] == [
        IDS["workspace_newlife"]
    ]

    all_workspaces = client.get(
        "/api/v1/workspaces?ordering=-name&limit=100",
        headers=auth_header(ops_token),
    )
    assert all_workspaces.status_code == 200
    assert {
        IDS["workspace_newlife"],
        IDS["workspace_aurora"],
    }.issubset({item["id"] for item in all_workspaces.json()["items"]})


def test_supplier_cannot_access_another_workspace(client: TestClient, newlife_token: str):
    response = client.get(
        f"/api/v1/workspaces/{IDS['workspace_aurora']}/leads",
        headers=auth_header(newlife_token),
    )
    assert response.status_code == 403


def test_lead_id_cannot_escape_workspace_scope(client: TestClient, ops_token: str):
    response = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/leads/{IDS['lead_dubai']}",
        headers=auth_header(ops_token),
    )
    assert response.status_code == 404
