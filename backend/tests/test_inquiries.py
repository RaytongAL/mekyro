from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header

SUPPLIER_INQUIRY = {
    "company_name": "Global Parts Factory",
    "main_business": "Industrial replacement parts",
    "country": "cn",
    "contact_name": "Li Wei",
    "phone": "+8613800000000",
    "email": "SALES@GLOBALPARTS.EXAMPLE",
    "remark": "Interested in joining the supplier network.",
}

BUYER_INQUIRY = {
    "company_name": "Nordic Import AB",
    "required_product": "Certified mobile devices",
    "country": "se",
    "contact_name": "Erik Andersson",
    "phone": "+46700000000",
    "email": "BUYER@NORDICIMPORT.EXAMPLE",
    "remark": "Monthly purchasing plan available.",
}


def test_public_inquiry_submission_and_operator_management(
    client: TestClient,
    ops_token: str,
    newlife_token: str,
):
    supplier = client.post("/api/v1/inquiries/suppliers", json=SUPPLIER_INQUIRY)
    buyer = client.post("/api/v1/inquiries/buyers", json=BUYER_INQUIRY)
    assert supplier.status_code == 201
    assert buyer.status_code == 201
    assert supplier.json()["country"] == "CN"
    assert supplier.json()["email"] == "sales@globalparts.example"
    assert buyer.json()["status"] == "pending"

    forbidden = client.get(
        "/api/v1/inquiries/suppliers",
        headers=auth_header(newlife_token),
    )
    assert forbidden.status_code == 403
    assert (
        client.get(
            "/api/v1/inquiries/buyers",
            headers=auth_header(newlife_token),
        ).status_code
        == 403
    )

    ops_headers = auth_header(ops_token)
    suppliers = client.get(
        "/api/v1/inquiries/suppliers?search=Global&status=pending&country=CN",
        headers=ops_headers,
    )
    assert suppliers.status_code == 200
    assert suppliers.json()["total"] == 1
    supplier_id = supplier.json()["id"]
    detail = client.get(f"/api/v1/inquiries/suppliers/{supplier_id}", headers=ops_headers)
    assert detail.status_code == 200

    updated = client.patch(
        f"/api/v1/inquiries/suppliers/{supplier_id}",
        headers=ops_headers,
        json={"status": "processing", "remark": "Assigned to onboarding team."},
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "processing"

    buyer_id = buyer.json()["id"]
    buyers = client.get(
        "/api/v1/inquiries/buyers?search=Certified&status=pending&country=SE",
        headers=ops_headers,
    )
    assert buyers.status_code == 200
    assert buyers.json()["total"] == 1
    assert buyers.json()["items"][0]["id"] == buyer_id
    buyer_detail = client.get(f"/api/v1/inquiries/buyers/{buyer_id}", headers=ops_headers)
    assert buyer_detail.status_code == 200
    assert buyer_detail.json()["email"] == "buyer@nordicimport.example"
    buyer_updated = client.patch(
        f"/api/v1/inquiries/buyers/{buyer_id}",
        headers=ops_headers,
        json={
            "status": "processing",
            "assigned_workspace_id": IDS["workspace_newlife"],
            "remark": "Assigned to New Life sales.",
        },
    )
    assert buyer_updated.status_code == 200, buyer_updated.text
    assert buyer_updated.json()["status"] == "processing"
    assert buyer_updated.json()["assigned_workspace_id"] == IDS["workspace_newlife"]
    assigned = client.get(
        "/api/v1/inquiries/buyers"
        f"?assigned_workspace_id={IDS['workspace_newlife']}&ordering=company_name",
        headers=ops_headers,
    )
    assert assigned.status_code == 200
    assert [item["id"] for item in assigned.json()["items"]] == [buyer_id]

    deleted = client.delete(f"/api/v1/inquiries/suppliers/{supplier_id}", headers=ops_headers)
    assert deleted.status_code == 204
    assert (
        client.get(f"/api/v1/inquiries/suppliers/{supplier_id}", headers=ops_headers).status_code
        == 404
    )
    assert (
        client.delete(f"/api/v1/inquiries/buyers/{buyer_id}", headers=ops_headers).status_code
        == 204
    )
    assert (
        client.get(f"/api/v1/inquiries/buyers/{buyer_id}", headers=ops_headers).status_code
        == 404
    )

    audit = client.get(
        "/api/v1/audit-logs?platform_only=true",
        headers=ops_headers,
    )
    assert audit.status_code == 200
    assert {
        "inquiry.supplier_submitted",
        "inquiry.buyer_submitted",
        "inquiry.supplier_updated",
        "inquiry.buyer_updated",
        "inquiry.supplier_deleted",
        "inquiry.buyer_deleted",
    }.issubset({item["action"] for item in audit.json()})


def test_public_inquiry_validation_rejects_invalid_contact_data(
    client: TestClient,
    ops_token: str,
):
    response = client.post(
        "/api/v1/inquiries/buyers",
        json={**BUYER_INQUIRY, "email": "not-an-email", "country": "Sweden"},
    )
    assert response.status_code == 422
    invalid_supplier_update = client.patch(
        f"/api/v1/inquiries/suppliers/{IDS['supplier_inquiry']}",
        headers=auth_header(ops_token),
        json={"email": "not-an-email"},
    )
    assert invalid_supplier_update.status_code == 422
    invalid_buyer_update = client.patch(
        f"/api/v1/inquiries/buyers/{IDS['buyer_inquiry']}",
        headers=auth_header(ops_token),
        json={"email": "not-an-email"},
    )
    assert invalid_buyer_update.status_code == 422


def test_inquiry_lists_accept_legacy_id_ordering(client: TestClient, ops_token: str):
    second_supplier = client.post(
        "/api/v1/inquiries/suppliers",
        json={
            "company_name": "Second Supplier Ltd",
            "main_business": "Consumer electronics",
            "country": "GB",
            "contact_name": "Morgan Lee",
            "phone": "+442000000001",
            "email": "morgan@second-supplier.example",
        },
    )
    second_buyer = client.post(
        "/api/v1/inquiries/buyers",
        json={
            "company_name": "Second Buyer Ltd",
            "required_product": "Refurbished phones",
            "country": "FR",
            "contact_name": "Camille Roy",
            "phone": "+33100000001",
            "email": "camille@second-buyer.example",
        },
    )
    assert second_supplier.status_code == 201
    assert second_buyer.status_code == 201

    headers = auth_header(ops_token)
    for resource in ("suppliers", "buyers"):
        ascending = client.get(
            f"/api/v1/inquiries/{resource}?ordering=id", headers=headers
        )
        descending = client.get(
            f"/api/v1/inquiries/{resource}?ordering=-id", headers=headers
        )
        assert ascending.status_code == 200
        assert descending.status_code == 200
        ascending_times = [item["created_at"] for item in ascending.json()["items"]]
        descending_times = [item["created_at"] for item in descending.json()["items"]]
        assert ascending_times == sorted(ascending_times)
        assert descending_times == sorted(descending_times, reverse=True)
