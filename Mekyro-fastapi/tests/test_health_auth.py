from fastapi.testclient import TestClient

from tests.conftest import auth_header


def test_health_checks_database(client: TestClient):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_login_and_current_user(client: TestClient, newlife_token: str):
    response = client.get("/api/v1/auth/me", headers=auth_header(newlife_token))
    assert response.status_code == 200
    assert response.json()["username"] == "newlife"
    assert response.json()["is_platform_admin"] is False


def test_password_login_supports_phone_and_vendor_boundary(client: TestClient):
    phone_login = client.post(
        "/api/v1/auth/login",
        json={"username": "+86 138-0013-8000", "password": "Mekyro123!"},
    )
    assert phone_login.status_code == 200
    assert phone_login.json()["user"]["username"] == "newlife"

    vendor_login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "OWNER@NEWLIFE.EXAMPLE",
            "password": "Mekyro123!",
            "vendor_only": True,
        },
    )
    assert vendor_login.status_code == 200
    assert vendor_login.json()["user"]["username"] == "newlife"

    platform_login = client.post(
        "/api/v1/auth/login",
        json={"username": "ops", "password": "Mekyro123!", "vendor_only": True},
    )
    assert platform_login.status_code == 403
    assert platform_login.json()["detail"] == "Vendor Workspace required"


def test_invalid_password_is_rejected(client: TestClient):
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "newlife", "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_openapi_contains_versioned_routes(client: TestClient):
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/workspaces/{workspace_id}/leads" in paths
    assert "/api/v1/workspaces/{workspace_id}/products" in paths
