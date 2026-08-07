from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def test_order_items_status_shipping_and_idempotency(
    client: TestClient,
    newlife_token: str,
):
    headers = {**auth_header(newlife_token), "Idempotency-Key": "order-create-test-001"}
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    request = {
        "order_number": "TEST-ORDER-001",
        "lead_id": IDS["lead_paris"],
        "currency": "USD",
        "items": [
            {"variant_id": IDS["variant_iphone_a"], "quantity": 10, "unit_price": "400.00"},
            {"variant_id": IDS["variant_charger"], "quantity": 100, "unit_price": "5.50"},
        ],
    }
    first = client.post(f"{base}/orders", headers=headers, json=request)
    replay = client.post(f"{base}/orders", headers=headers, json=request)
    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]
    assert first.json()["total_amount"] == "4550.00"
    order_id = first.json()["id"]

    replaced = client.put(
        f"{base}/orders/{order_id}/items",
        headers=auth_header(newlife_token),
        json=[{"variant_id": IDS["variant_iphone_b"], "quantity": 20, "unit_price": "350.00"}],
    )
    assert replaced.status_code == 200
    assert replaced.json()["total_amount"] == "7000.00"
    assert len(replaced.json()["items"]) == 1

    invalid_jump = client.patch(
        f"{base}/orders/{order_id}",
        headers=auth_header(newlife_token),
        json={"order_status": "completed"},
    )
    assert invalid_jump.status_code == 409
    confirmed = client.patch(
        f"{base}/orders/{order_id}",
        headers=auth_header(newlife_token),
        json={"order_status": "confirmed", "payment_status": "partial"},
    )
    assert confirmed.status_code == 200

    locked_items = client.put(
        f"{base}/orders/{order_id}/items",
        headers=auth_header(newlife_token),
        json=[{"variant_id": IDS["variant_iphone_a"], "quantity": 1, "unit_price": "400.00"}],
    )
    assert locked_items.status_code == 409

    shipment = client.post(
        f"{base}/orders/{order_id}/shipments",
        headers=auth_header(newlife_token),
        json={"carrier": "DHL", "tracking_number": "DHL-TEST-001"},
    )
    assert shipment.status_code == 201
    shipment_id = shipment.json()["id"]
    shipped = client.patch(
        f"{base}/orders/{order_id}/shipments/{shipment_id}",
        headers=auth_header(newlife_token),
        json={"shipping_status": "shipped"},
    )
    assert shipped.status_code == 200
    assert shipped.json()["shipped_at"] is not None
    delivered = client.patch(
        f"{base}/orders/{order_id}/shipments/{shipment_id}",
        headers=auth_header(newlife_token),
        json={"shipping_status": "delivered"},
    )
    assert delivered.status_code == 200

    order = client.get(f"{base}/orders/{order_id}", headers=auth_header(newlife_token))
    assert len(order.json()["shipments"]) == 1
    assert order.json()["shipments"][0]["shipping_status"] == "delivered"
    audit = client.get(f"{base}/audit-logs", headers=auth_header(newlife_token))
    assert {
        "order.created",
        "order.items_replaced",
        "order.status_updated",
        "shipping.created",
        "shipping.updated",
    }.issubset({item["action"] for item in audit.json()})


def test_order_rejects_cross_tenant_lead_and_variant(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = {**auth_header(newlife_token), "Idempotency-Key": "order-cross-tenant-001"}
    foreign_lead = client.post(
        f"{base}/orders",
        headers=headers,
        json={
            "lead_id": IDS["lead_dubai"],
            "items": [
                {"variant_id": IDS["variant_iphone_a"], "quantity": 1, "unit_price": "400.00"}
            ],
        },
    )
    assert foreign_lead.status_code == 404

    headers["Idempotency-Key"] = "order-cross-tenant-002"
    foreign_variant = client.post(
        f"{base}/orders",
        headers=headers,
        json={
            "lead_id": IDS["lead_paris"],
            "items": [{"variant_id": IDS["variant_lamp"], "quantity": 1, "unit_price": "8.90"}],
        },
    )
    assert foreign_variant.status_code == 404
