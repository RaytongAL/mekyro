from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def test_lead_write_workflow_is_audited(client: TestClient, newlife_token: str):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = auth_header(newlife_token)
    create = client.post(
        f"{base}/leads",
        headers=headers,
        json={
            "source": "manual",
            "external_ref": "TEST-CRM-001",
            "merchant_name": "Rome Circular Mobile",
            "company_name": "RCM SRL",
            "contact_person": "Giulia Rossi",
            "country": "it",
            "email": "giulia@rcm.example",
            "recommendation_score": 72,
            "recommendation_reason": "Requested a current wholesale list.",
        },
    )
    assert create.status_code == 201
    lead = create.json()
    assert lead["stage"] == "new"
    assert lead["country"] == "IT"

    invalid_transition = client.patch(
        f"{base}/leads/{lead['id']}",
        headers=headers,
        json={"stage": "ordered"},
    )
    assert invalid_transition.status_code == 409

    stage_change = client.patch(
        f"{base}/leads/{lead['id']}",
        headers=headers,
        json={"stage": "contacting"},
    )
    assert stage_change.status_code == 200
    assert stage_change.json()["stage"] == "contacting"

    activity = client.post(
        f"{base}/leads/{lead['id']}/activities",
        headers=headers,
        json={
            "direction": "outbound",
            "channel": "email",
            "subject": "Wholesale inventory",
            "sender": "sales@newlife.example",
            "recipient": "giulia@rcm.example",
            "content": "Shared current availability and requested target quantities.",
        },
    )
    assert activity.status_code == 201

    activities = client.get(f"{base}/leads/{lead['id']}/activities", headers=headers)
    assert activities.status_code == 200
    assert activities.json()["total"] == 1
    assert [item["id"] for item in activities.json()["items"]] == [activity.json()["id"]]

    audit = client.get(f"{base}/audit-logs", headers=headers)
    assert audit.status_code == 200
    assert {
        "crm.lead_created",
        "crm.lead_stage_changed",
        "crm.activity_created",
    }.issubset({item["action"] for item in audit.json()})


def test_crm_writes_cannot_use_cross_tenant_lead_id(
    client: TestClient,
    newlife_token: str,
):
    response = client.post(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/leads/{IDS['lead_dubai']}/activities",
        headers=auth_header(newlife_token),
        json={
            "direction": "outbound",
            "channel": "email",
            "content": "This must never be written.",
        },
    )
    assert response.status_code == 404


def test_crm_rejects_invalid_lead_and_contact_email_fields(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = auth_header(newlife_token)
    invalid_create = client.post(
        f"{base}/leads",
        headers=headers,
        json={
            "external_ref": "INVALID-EMAIL-CREATE",
            "merchant_name": "Invalid Contact",
            "company_name": "Invalid Contact Ltd",
            "country": "US",
            "email": "not-an-email",
        },
    )
    assert invalid_create.status_code == 422

    invalid_update = client.patch(
        f"{base}/leads/{IDS['lead_paris']}",
        headers=headers,
        json={"email": "still-not-an-email"},
    )
    assert invalid_update.status_code == 422

    invalid_activity = client.post(
        f"{base}/leads/{IDS['lead_paris']}/activities",
        headers=headers,
        json={
            "channel": "email",
            "recipient": "invalid-recipient",
            "content": "This payload must be rejected before persistence.",
        },
    )
    assert invalid_activity.status_code == 422
