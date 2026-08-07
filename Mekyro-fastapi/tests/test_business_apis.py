from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def test_filtered_leads_and_activities(client: TestClient, newlife_token: str):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = auth_header(newlife_token)
    response = client.get(
        f"{base}/leads?stage=qualified",
        headers=headers,
    )
    payload = response.json()
    assert response.status_code == 200
    assert payload["total"] == 1
    assert payload["items"][0]["merchant_name"] == "Paris Mobile Retail"
    assert payload["items"][0]["workspace_id"] == IDS["workspace_newlife"]
    assert payload["items"][0]["workspace_name"] == "New Life Refurb Supply"
    assert payload["items"][0]["latest_contact_at"] is not None

    detail = client.get(
        f"{base}/leads/{IDS['lead_paris']}",
        headers=headers,
    )
    assert detail.status_code == 200
    assert detail.json()["company_name"] == "PMR Distribution SAS"
    assert detail.json()["latest_contact_at"] is not None

    response = client.get(
        f"{base}/leads/{IDS['lead_paris']}/activities",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert len(response.json()["items"]) == 2
    assert response.json()["items"][0]["direction"] == "inbound"
    assert response.json()["items"][0]["merchant_name"] == "Paris Mobile Retail"

    workspace_activities = client.get(
        f"{base}/activities?search=availability",
        headers=headers,
    )
    assert workspace_activities.status_code == 200
    assert workspace_activities.json()["total"] == 2
    assert {item["lead_id"] for item in workspace_activities.json()["items"]} == {
        IDS["lead_paris"]
    }

    contact_search = client.get(f"{base}/leads?search=Anna%20Weber", headers=headers)
    assert contact_search.status_code == 200
    assert [item["id"] for item in contact_search.json()["items"]] == [IDS["lead_berlin"]]

    leads_ascending = client.get(f"{base}/leads?ordering=id", headers=headers).json()["items"]
    leads_descending = client.get(f"{base}/leads?ordering=-id", headers=headers).json()["items"]
    assert [item["id"] for item in leads_ascending] == [
        IDS["lead_paris"],
        IDS["lead_madrid"],
        IDS["lead_berlin"],
    ]
    assert [item["id"] for item in leads_descending] == [
        IDS["lead_berlin"],
        IDS["lead_madrid"],
        IDS["lead_paris"],
    ]

    activities_ascending = client.get(
        f"{base}/activities?ordering=id", headers=headers
    ).json()["items"]
    activities_descending = client.get(
        f"{base}/activities?ordering=-id", headers=headers
    ).json()["items"]
    assert [item["created_at"] for item in activities_ascending] == sorted(
        item["created_at"] for item in activities_ascending
    )
    assert [item["created_at"] for item in activities_descending] == sorted(
        (item["created_at"] for item in activities_descending), reverse=True
    )


def test_products_include_variants_and_price_tiers(client: TestClient, newlife_token: str):
    response = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/products",
        headers=auth_header(newlife_token),
    )
    payload = response.json()
    assert response.status_code == 200
    assert payload["total"] == 2
    iphone = next(item for item in payload["items"] if item["id"] == IDS["product_iphone"])
    assert iphone["workspace_id"] == IDS["workspace_newlife"]
    assert iphone["sku_count"] == 2
    assert iphone["total_stock"] == 120
    assert iphone["updated_at"]
    assert len(iphone["variants"]) == 2
    assert iphone["variants"][0]["price_tiers"]
    assert iphone["variants"][0]["workspace_id"] == IDS["workspace_newlife"]
    assert iphone["variants"][0]["updated_at"]


def test_catalog_filters_and_flat_variant_metadata(client: TestClient, newlife_token: str):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = auth_header(newlife_token)
    products = client.get(
        f"{base}/products?category_id={IDS['category_accessories']}&stock=out_of_stock",
        headers=headers,
    )
    assert products.status_code == 200
    assert [item["id"] for item in products.json()["items"]] == [IDS["product_charger"]]

    variants = client.get(
        f"{base}/variants?search=iPhone&spec_key=Grade&spec_value=A&ordering=-stock_quantity",
        headers=headers,
    )
    assert variants.status_code == 200
    assert len(variants.json()) == 1
    assert variants.json()[0]["id"] == IDS["variant_iphone_a"]
    assert variants.json()[0]["product_name"] == "iPhone 13 Certified Pre-Owned"
    assert variants.json()[0]["category_id"] == IDS["category_phones"]

    multi_spec = client.get(
        f"{base}/variants?spec_key=Grade,Storage&spec_value=A,128GB",
        headers=headers,
    )
    assert multi_spec.status_code == 200
    assert [item["id"] for item in multi_spec.json()] == [IDS["variant_iphone_a"]]

    invalid_multi_spec = client.get(
        f"{base}/variants?spec_key=Grade,Storage&spec_value=A",
        headers=headers,
    )
    assert invalid_multi_spec.status_code == 422

    specification_search = client.get(
        f"{base}/variants?search=128GB&ordering=sku_code",
        headers=auth_header(newlife_token),
    )
    assert specification_search.status_code == 200
    assert [item["id"] for item in specification_search.json()] == [
        IDS["variant_iphone_a"],
        IDS["variant_iphone_b"],
    ]


def test_inventory_movements_are_tenant_scoped(client: TestClient, newlife_token: str):
    response = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/inventory-movements",
        headers=auth_header(newlife_token),
    )
    payload = response.json()
    assert response.status_code == 200
    assert payload["total"] == 2
    assert len(payload["items"]) == 2
    assert {item["sku_code"] for item in payload["items"]} == {"IP13-128-A"}
    assert {item["created_by"] for item in payload["items"]} == {"newlife"}

    filtered = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/inventory-movements"
        f"?variant_id={IDS['variant_iphone_a']}&type=outbound&search=allocation",
        headers=auth_header(newlife_token),
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["movement_type"] == "outbound"
    assert filtered.json()["items"][0]["reference"] == "ORD-NL-20260721"

    paginated = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/inventory-movements"
        "?ordering=created_at&page=2&page_size=1",
        headers=auth_header(newlife_token),
    )
    assert paginated.status_code == 200
    assert paginated.json()["total"] == 2
    assert paginated.json()["limit"] == 1
    assert paginated.json()["offset"] == 1
    assert len(paginated.json()["items"]) == 1


def test_dashboard_uses_real_fake_database_aggregates(client: TestClient, newlife_token: str):
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    headers = auth_header(newlife_token)
    response = client.get(
        f"{base}/dashboard",
        headers=headers,
    )
    payload = response.json()
    assert response.status_code == 200
    assert payload["leads"]["total"] == 3
    assert payload["leads"]["activities"] == 3
    assert payload["leads"]["contact_log_total"] == 3
    assert payload["leads"]["high_score"] == 2
    assert payload["leads"]["with_phone"] == 1
    assert payload["leads"]["with_email"] == 3
    assert payload["leads"]["with_whatsapp"] == 2
    assert payload["leads"]["score_high"] == 1
    assert payload["leads"]["score_mid"] == 2
    assert payload["leads"]["score_low"] == 0
    assert [item["id"] for item in payload["leads"]["recent"]] == [
        IDS["lead_berlin"],
        IDS["lead_madrid"],
        IDS["lead_paris"],
    ]
    assert payload["leads"]["countries"] == [
        {"country": "DE", "count": 1},
        {"country": "ES", "count": 1},
        {"country": "FR", "count": 1},
    ]
    assert payload["catalog"] == {
        "products": 2,
        "variants": 3,
        "stock_quantity": 120,
        "out_of_stock_variants": 1,
    }
    assert payload["quotes"] == {
        "total": 1,
        "draft": 1,
        "sent": 0,
        "accepted": 0,
        "rejected": 0,
        "conversion_rate": "0.00",
    }
    assert payload["orders"]["total"] == 2
    assert payload["orders"]["fulfilling"] == 0
    assert payload["orders"]["total_amount"] == "11650.00"

    confirmed = client.patch(
        f"{base}/orders/{IDS['order_newlife_pending']}",
        headers=headers,
        json={"order_status": "confirmed"},
    )
    assert confirmed.status_code == 200
    refreshed = client.get(f"{base}/dashboard", headers=headers)
    assert refreshed.status_code == 200
    assert refreshed.json()["orders"]["fulfilling"] == 1
