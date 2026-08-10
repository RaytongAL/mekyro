from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def test_inventory_adjustment_is_idempotent_and_audited(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = {**auth_header(newlife_token), "Idempotency-Key": "test-inventory-001"}
    request = {
        "variant_id": IDS["variant_iphone_a"],
        "quantity_delta": 7,
        "reason": "Cycle count correction",
        "reference": "COUNT-2026-07-28",
    }
    before = client.get(f"{base}/inventory-movements", headers=headers).json()

    first = client.post(f"{base}/inventory-adjustments", headers=headers, json=request)
    replay = client.post(f"{base}/inventory-adjustments", headers=headers, json=request)
    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.json() == first.json()
    assert first.json()["balance_after"] == 91
    assert first.json()["created_by"] == "newlife"

    after = client.get(f"{base}/inventory-movements", headers=headers).json()
    assert after["total"] == before["total"] + 1
    assert after["items"][0]["id"] == first.json()["movement_id"]

    audit = client.get(
        f"{base}/audit-logs?action=inventory.adjusted",
        headers=headers,
    )
    assert audit.status_code == 200
    assert len(audit.json()) == 1
    assert audit.json()[0]["payload"]["balance_after"] == 91


def test_idempotency_key_rejects_different_inventory_request(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = {**auth_header(newlife_token), "Idempotency-Key": "test-inventory-conflict"}
    request = {
        "variant_id": IDS["variant_iphone_b"],
        "quantity_delta": 1,
        "reason": "First correction",
    }
    assert (
        client.post(f"{base}/inventory-adjustments", headers=headers, json=request).status_code
        == 201
    )

    conflict = client.post(
        f"{base}/inventory-adjustments",
        headers=headers,
        json={**request, "quantity_delta": 2},
    )
    assert conflict.status_code == 409


def test_inventory_adjustment_rejects_negative_stock_and_cross_tenant_variant(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = {**auth_header(newlife_token), "Idempotency-Key": "test-inventory-negative"}
    negative = client.post(
        f"{base}/inventory-adjustments",
        headers=headers,
        json={
            "variant_id": IDS["variant_charger"],
            "quantity_delta": -1,
            "reason": "Invalid outbound correction",
        },
    )
    assert negative.status_code == 409

    headers["Idempotency-Key"] = "test-inventory-cross-tenant"
    cross_tenant = client.post(
        f"{base}/inventory-adjustments",
        headers=headers,
        json={
            "variant_id": IDS["variant_lamp"],
            "quantity_delta": 1,
            "reason": "Must not modify another supplier's SKU",
        },
    )
    assert cross_tenant.status_code == 404


def test_inventory_movement_type_enforces_quantity_direction(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = {**auth_header(newlife_token), "Idempotency-Key": "typed-inventory-inbound"}
    inbound = client.post(
        f"{base}/inventory-adjustments",
        headers=headers,
        json={
            "variant_id": IDS["variant_iphone_a"],
            "movement_type": "inbound",
            "quantity_delta": 4,
            "reason": "Typed inbound receipt",
        },
    )
    assert inbound.status_code == 201
    assert inbound.json()["movement_type"] == "inbound"

    headers["Idempotency-Key"] = "typed-inventory-invalid"
    invalid = client.post(
        f"{base}/inventory-adjustments",
        headers=headers,
        json={
            "variant_id": IDS["variant_iphone_a"],
            "movement_type": "outbound",
            "quantity_delta": 2,
            "reason": "Invalid outbound sign",
        },
    )
    assert invalid.status_code == 422
