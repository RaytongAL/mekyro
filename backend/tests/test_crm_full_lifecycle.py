from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def test_lead_batch_full_update_and_delete_preserves_order(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    batch = client.post(
        f"{base}/leads/batch",
        headers=headers,
        json={
            "items": [
                {
                    "source": "manual",
                    "external_ref": "CRM-BATCH-001",
                    "merchant_name": "Batch Merchant One",
                    "company_name": "Batch One Ltd",
                    "country": "gb",
                    "zip_code": "SW1A 1AA",
                    "description": "First batch lead",
                    "country_code": "+44",
                },
                {
                    "source": "website",
                    "external_ref": "CRM-BATCH-002",
                    "merchant_name": "Batch Merchant Two",
                    "company_name": "Batch Two GmbH",
                    "country": "de",
                },
            ]
        },
    )
    assert batch.status_code == 201
    assert len(batch.json()) == 2
    lead = batch.json()[0]
    assert lead["country"] == "GB"
    assert lead["zip_code"] == "SW1A 1AA"
    assert lead["workspace_name"] == "New Life Refurb Supply"

    updated = client.patch(
        f"{base}/leads/{lead['id']}",
        headers=headers,
        json={
            "merchant_name": "Updated Batch Merchant",
            "description": "Updated description",
            "stage": "contacting",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["merchant_name"] == "Updated Batch Merchant"
    assert updated.json()["description"] == "Updated description"
    assert updated.json()["stage"] == "contacting"

    seeded_orders = client.get(
        f"{base}/orders?lead_id={IDS['lead_paris']}",
        headers=headers,
    )
    assert seeded_orders.status_code == 200
    order_id = seeded_orders.json()["items"][0]["id"]
    deleted = client.delete(f"{base}/leads/{IDS['lead_paris']}", headers=headers)
    assert deleted.status_code == 204
    order = client.get(f"{base}/orders/{order_id}", headers=headers)
    assert order.status_code == 200
    assert order.json()["lead_id"] is None


def test_contact_activity_batch_search_update_and_delete(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    batch = client.post(
        f"{base}/leads/{IDS['lead_berlin']}/activities/batch",
        headers=headers,
        json={
            "items": [
                {
                    "activity_type": "ai_outbound",
                    "channel": "email",
                    "subject": "Automated introduction",
                    "content": "AI generated introduction for catalog review.",
                },
                {
                    "activity_type": "customer_inbound",
                    "channel": "whatsapp",
                    "content": "Buyer requested MOQ details.",
                },
            ]
        },
    )
    assert batch.status_code == 201
    assert [item["direction"] for item in batch.json()] == ["outbound", "inbound"]
    activity_id = batch.json()[0]["id"]

    search = client.get(
        f"{base}/activities?lead_id={IDS['lead_berlin']}&type=ai_outbound&search=introduction",
        headers=headers,
    )
    assert search.status_code == 200
    assert search.json()["total"] == 1
    assert [item["id"] for item in search.json()["items"]] == [activity_id]

    detail = client.get(f"{base}/activities/{activity_id}", headers=headers)
    assert detail.status_code == 200
    updated = client.patch(
        f"{base}/activities/{activity_id}",
        headers=headers,
        json={"activity_type": "customer_inbound", "content": "Customer replied by email."},
    )
    assert updated.status_code == 200
    assert updated.json()["direction"] == "inbound"
    assert updated.json()["content"] == "Customer replied by email."

    deleted = client.delete(f"{base}/activities/{activity_id}", headers=headers)
    assert deleted.status_code == 204
    assert client.get(f"{base}/activities/{activity_id}", headers=headers).status_code == 404


def test_crm_batch_rolls_back_on_duplicate_reference(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    response = client.post(
        f"{base}/leads/batch",
        headers=headers,
        json={
            "items": [
                {
                    "source": "manual",
                    "external_ref": "CRM-DUPLICATE",
                    "merchant_name": "First Duplicate",
                    "company_name": "First Ltd",
                    "country": "US",
                },
                {
                    "source": "manual",
                    "external_ref": "CRM-DUPLICATE",
                    "merchant_name": "Second Duplicate",
                    "company_name": "Second Ltd",
                    "country": "US",
                },
            ]
        },
    )
    assert response.status_code == 409
    search = client.get(f"{base}/leads?search=Duplicate", headers=headers)
    assert search.status_code == 200
    assert search.json()["total"] == 0
