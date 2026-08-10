from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def quote_payload(**overrides):
    payload = {
        "quote_number": "Q-TEST-001",
        "lead_id": IDS["lead_paris"],
        "currency": "USD",
        "valid_until": (date.today() + timedelta(days=30)).isoformat(),
        "discount_amount": "50.00",
        "tax_amount": "100.00",
        "shipping_amount": "25.00",
        "notes": "Initial commercial offer",
        "terms": "Net 30; EXW Hong Kong",
        "items": [
            {
                "variant_id": IDS["variant_iphone_a"],
                "description": "Grade A devices",
                "quantity": 10,
                "unit_price": "400.00",
            },
            {
                "variant_id": IDS["variant_charger"],
                "description": "EU chargers",
                "quantity": 100,
                "unit_price": "5.50",
            },
        ],
    }
    payload.update(overrides)
    return payload


def test_quote_draft_send_revision_and_rejection_preserves_version_history(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = auth_header(newlife_token)
    seeded = client.get(
        f"{base}/quotes",
        headers=headers,
        params={"search": "Q-NL-2026-0001"},
    )
    assert seeded.status_code == 200
    assert seeded.json()["total"] == 1
    assert seeded.json()["items"][0]["versions"][0]["version_number"] == 1

    created = client.post(f"{base}/quotes", headers=headers, json=quote_payload())
    assert created.status_code == 201
    assert created.json()["subtotal_amount"] == "4550.00"
    assert created.json()["total_amount"] == "4625.00"
    assert created.json()["current_version"] == 1
    assert created.json()["versions"][0]["items_snapshot"][0]["sku_code"] == "IP13-128-A"
    quote_id = created.json()["id"]

    updated = client.patch(
        f"{base}/quotes/{quote_id}",
        headers=headers,
        json={
            "notes": "Buyer requested a larger phone allocation",
            "items": [
                {
                    "variant_id": IDS["variant_iphone_a"],
                    "quantity": 12,
                    "unit_price": "390.00",
                }
            ],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["subtotal_amount"] == "4680.00"
    assert updated.json()["total_amount"] == "4755.00"
    assert updated.json()["versions"][0]["items_snapshot"][0]["quantity"] == 12

    sent = client.post(f"{base}/quotes/{quote_id}/send", headers=headers)
    assert sent.status_code == 200
    assert sent.json()["status"] == "sent"
    assert sent.json()["sent_at"] is not None
    lead = client.get(f"{base}/leads/{IDS['lead_paris']}", headers=headers)
    assert lead.json()["stage"] == "quoting"

    locked = client.patch(
        f"{base}/quotes/{quote_id}",
        headers=headers,
        json={"notes": "This must not mutate an issued quote"},
    )
    assert locked.status_code == 409

    revised = client.post(
        f"{base}/quotes/{quote_id}/revise",
        headers=headers,
        json={
            "discount_amount": "100.00",
            "items": [
                {
                    "variant_id": IDS["variant_iphone_b"],
                    "description": "Revised Grade B offer",
                    "quantity": 20,
                    "unit_price": "350.00",
                }
            ],
        },
    )
    assert revised.status_code == 200
    body = revised.json()
    assert body["status"] == "draft"
    assert body["current_version"] == 2
    assert body["total_amount"] == "7025.00"
    assert [version["status"] for version in body["versions"]] == ["superseded", "draft"]
    assert body["versions"][0]["items_snapshot"][0]["quantity"] == 12
    assert body["versions"][1]["items_snapshot"][0]["quantity"] == 20

    assert client.post(f"{base}/quotes/{quote_id}/send", headers=headers).status_code == 200
    rejected = client.post(
        f"{base}/quotes/{quote_id}/reject",
        headers=headers,
        json={"decision_note": "Buyer needs a lower target price"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["decision_note"] == "Buyer needs a lower target price"
    assert rejected.json()["versions"][1]["status"] == "rejected"

    listed = client.get(
        f"{base}/quotes",
        headers=headers,
        params={"status": "rejected", "search": "Q-TEST"},
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == quote_id

    audit = client.get(f"{base}/audit-logs", headers=headers)
    assert {
        "quote.created",
        "quote.updated",
        "quote.sent",
        "quote.revised",
        "quote.rejected",
    }.issubset({item["action"] for item in audit.json()})


def test_accepted_quote_creates_one_idempotent_order(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = auth_header(newlife_token)
    request = quote_payload(quote_number="Q-ACCEPT-001")
    created = client.post(f"{base}/quotes", headers=headers, json=request)
    quote_id = created.json()["id"]
    assert client.post(f"{base}/quotes/{quote_id}/send", headers=headers).status_code == 200

    accept_headers = {**headers, "Idempotency-Key": "quote-accept-test-001"}
    first = client.post(
        f"{base}/quotes/{quote_id}/accept",
        headers=accept_headers,
        json={"order_number": "ORDER-FROM-QUOTE-001"},
    )
    replay = client.post(
        f"{base}/quotes/{quote_id}/accept",
        headers=accept_headers,
        json={"order_number": "ORDER-FROM-QUOTE-001"},
    )
    assert first.status_code == 200
    assert replay.status_code == 200
    assert replay.json()["order_id"] == first.json()["order_id"]
    assert first.json()["status"] == "accepted"
    assert first.json()["versions"][0]["status"] == "accepted"

    conflict = client.post(
        f"{base}/quotes/{quote_id}/accept",
        headers=accept_headers,
        json={"order_number": "A-DIFFERENT-ORDER-NUMBER"},
    )
    assert conflict.status_code == 409

    order = client.get(f"{base}/orders/{first.json()['order_id']}", headers=headers)
    assert order.status_code == 200
    assert order.json()["order_number"] == "ORDER-FROM-QUOTE-001"
    assert order.json()["total_amount"] == first.json()["total_amount"]
    assert len(order.json()["items"]) == 2
    lead = client.get(f"{base}/leads/{IDS['lead_paris']}", headers=headers)
    assert lead.json()["stage"] == "ordered"

    orders = client.get(f"{base}/orders", headers=headers)
    assert sum(item["id"] == first.json()["order_id"] for item in orders.json()["items"]) == 1
    dashboard = client.get(f"{base}/dashboard", headers=headers)
    assert dashboard.json()["quotes"]["accepted"] == 1
    assert dashboard.json()["quotes"]["conversion_rate"] == "100.00"
    audit = client.get(f"{base}/audit-logs", headers=headers)
    assert {"quote.accepted", "order.created_from_quote"}.issubset(
        {item["action"] for item in audit.json()}
    )


def test_quote_enforces_assigned_inquiry_and_tenant_catalog_boundaries(
    client: TestClient,
    newlife_token: str,
    ops_token: str,
):
    newlife_base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    aurora_base = f"/api/v1/workspaces/{IDS['workspace_aurora']}"
    headers = auth_header(newlife_token)

    unassigned = client.post(
        f"{newlife_base}/quotes",
        headers=headers,
        json=quote_payload(
            quote_number="Q-INQUIRY-001",
            lead_id=None,
            buyer_inquiry_id=IDS["buyer_inquiry"],
        ),
    )
    assert unassigned.status_code == 404

    assigned = client.patch(
        f"/api/v1/inquiries/buyers/{IDS['buyer_inquiry']}",
        headers=auth_header(ops_token),
        json={"assigned_workspace_id": IDS["workspace_newlife"]},
    )
    assert assigned.status_code == 200
    assert assigned.json()["assigned_workspace_id"] == IDS["workspace_newlife"]

    created = client.post(
        f"{newlife_base}/quotes",
        headers=headers,
        json=quote_payload(
            quote_number="Q-INQUIRY-001",
            lead_id=None,
            buyer_inquiry_id=IDS["buyer_inquiry"],
        ),
    )
    assert created.status_code == 201
    assert created.json()["customer_name"] == "Benelux Device Wholesale"
    quote_id = created.json()["id"]

    aurora_login = client.post(
        "/api/v1/auth/login",
        json={"username": "aurora", "password": "Mekyro123!"},
    )
    aurora_headers = auth_header(aurora_login.json()["access_token"])
    assert client.get(f"{aurora_base}/quotes/{quote_id}", headers=aurora_headers).status_code == 404
    foreign_inquiry = client.post(
        f"{aurora_base}/quotes",
        headers=aurora_headers,
        json=quote_payload(
            quote_number="Q-CROSS-INQUIRY",
            lead_id=None,
            buyer_inquiry_id=IDS["buyer_inquiry"],
            items=[
                {
                    "variant_id": IDS["variant_lamp"],
                    "quantity": 200,
                    "unit_price": "8.50",
                }
            ],
        ),
    )
    assert foreign_inquiry.status_code == 404

    deleted_inquiry = client.delete(
        f"/api/v1/inquiries/buyers/{IDS['buyer_inquiry']}",
        headers=auth_header(ops_token),
    )
    assert deleted_inquiry.status_code == 204
    historical_quote = client.get(f"{newlife_base}/quotes/{quote_id}", headers=headers)
    assert historical_quote.status_code == 200
    assert historical_quote.json()["buyer_inquiry_id"] is None
    assert historical_quote.json()["customer_name"] == "Benelux Device Wholesale"

    foreign_lead = client.post(
        f"{newlife_base}/quotes",
        headers=headers,
        json=quote_payload(quote_number="Q-CROSS-LEAD", lead_id=IDS["lead_dubai"]),
    )
    assert foreign_lead.status_code == 404
    foreign_variant = client.post(
        f"{newlife_base}/quotes",
        headers=headers,
        json=quote_payload(
            quote_number="Q-CROSS-SKU",
            items=[
                {
                    "variant_id": IDS["variant_lamp"],
                    "quantity": 1,
                    "unit_price": "8.90",
                }
            ],
        ),
    )
    assert foreign_variant.status_code == 404


def test_quote_validation_state_machine_and_failed_conversion_are_atomic(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = auth_header(newlife_token)

    no_source = client.post(
        f"{base}/quotes",
        headers=headers,
        json=quote_payload(quote_number="Q-NO-SOURCE", lead_id=None),
    )
    assert no_source.status_code == 422
    duplicate_variant = client.post(
        f"{base}/quotes",
        headers=headers,
        json=quote_payload(
            quote_number="Q-DUPLICATE-SKU",
            items=[quote_payload()["items"][0], quote_payload()["items"][0]],
        ),
    )
    assert duplicate_variant.status_code == 422
    past_validity = client.post(
        f"{base}/quotes",
        headers=headers,
        json=quote_payload(
            quote_number="Q-PAST",
            valid_until=(date.today() - timedelta(days=1)).isoformat(),
        ),
    )
    assert past_validity.status_code == 422
    excessive_discount = client.post(
        f"{base}/quotes",
        headers=headers,
        json=quote_payload(quote_number="Q-DISCOUNT", discount_amount="100000.00"),
    )
    assert excessive_discount.status_code == 422
    excessive_line_total = client.post(
        f"{base}/quotes",
        headers=headers,
        json=quote_payload(
            quote_number="Q-AMOUNT-LIMIT",
            items=[
                {
                    "variant_id": IDS["variant_iphone_a"],
                    "quantity": 1_000_000_000,
                    "unit_price": "9999999999.99",
                }
            ],
        ),
    )
    assert excessive_line_total.status_code == 422

    created = client.post(
        f"{base}/quotes",
        headers=headers,
        json=quote_payload(quote_number="Q-ATOMIC-001"),
    )
    assert created.status_code == 201
    quote_id = created.json()["id"]
    assert (
        client.post(
            f"{base}/quotes/{quote_id}/accept",
            headers={**headers, "Idempotency-Key": "quote-draft-accept-001"},
            json={},
        ).status_code
        == 409
    )
    assert (
        client.post(f"{base}/quotes/{quote_id}/reject", headers=headers, json={}).status_code == 409
    )
    assert (
        client.post(f"{base}/quotes/{quote_id}/revise", headers=headers, json={}).status_code == 409
    )

    assert client.post(f"{base}/quotes/{quote_id}/send", headers=headers).status_code == 200
    duplicate_order = client.post(
        f"{base}/quotes/{quote_id}/accept",
        headers={**headers, "Idempotency-Key": "quote-order-conflict-001"},
        json={"order_number": "NL-2026-0001"},
    )
    assert duplicate_order.status_code == 409
    unchanged = client.get(f"{base}/quotes/{quote_id}", headers=headers)
    assert unchanged.json()["status"] == "sent"
    assert unchanged.json()["order_id"] is None

    same_number = client.post(
        f"{base}/quotes",
        headers=headers,
        json=quote_payload(quote_number="Q-ATOMIC-001"),
    )
    assert same_number.status_code == 409
