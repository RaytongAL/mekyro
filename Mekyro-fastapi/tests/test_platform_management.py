from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def test_platform_operator_cross_workspace_read_models_and_dashboard(
    client: TestClient,
    ops_token: str,
    newlife_token: str,
):
    ops_headers = auth_header(ops_token)
    supplier_headers = auth_header(newlife_token)
    protected_paths = [
        "/api/v1/internal/leads",
        "/api/v1/internal/contact-logs",
        "/api/v1/internal/products",
        "/api/v1/internal/variants",
        "/api/v1/internal/categories",
        "/api/v1/internal/specification-options",
        "/api/v1/internal/products/trash",
        "/api/v1/internal/variants/trash",
        "/api/v1/internal/inventory-movements",
        "/api/v1/internal/dashboard/stats",
    ]
    for path in protected_paths:
        assert client.get(path, headers=supplier_headers).status_code == 403

    leads = client.get(
        "/api/v1/internal/leads?ordering=-recommendation_score", headers=ops_headers
    )
    assert leads.status_code == 200, leads.text
    assert leads.json()["total"] == 4
    assert {item["workspace_id"] for item in leads.json()["items"]} == {
        IDS["workspace_newlife"],
        IDS["workspace_aurora"],
    }
    assert [item["recommendation_score"] for item in leads.json()["items"]] == [91, 88, 78, 66]
    assert all(item["workspace_name"] for item in leads.json()["items"])
    assert all("latest_contact_at" in item for item in leads.json()["items"])
    filtered_leads = client.get(
        f"/api/v1/internal/leads?workspace_id={IDS['workspace_newlife']}&country=FR",
        headers=ops_headers,
    )
    assert filtered_leads.status_code == 200
    assert [item["id"] for item in filtered_leads.json()["items"]] == [IDS["lead_paris"]]
    dubai = client.get(f"/api/v1/internal/leads/{IDS['lead_dubai']}", headers=ops_headers)
    assert dubai.status_code == 200
    assert dubai.json()["workspace_id"] == IDS["workspace_aurora"]
    assert dubai.json()["workspace_name"] == "Aurora Home Export"
    assert client.get("/api/v1/internal/leads/missing", headers=ops_headers).status_code == 404

    logs = client.get(
        "/api/v1/internal/contact-logs?channel=email&ordering=created_at&limit=2",
        headers=ops_headers,
    )
    assert logs.status_code == 200
    assert logs.json()["total"] == 3
    assert logs.json()["limit"] == 2
    assert len(logs.json()["items"]) == 2
    assert all(item["channel"] == "email" for item in logs.json()["items"])
    assert {item["workspace_id"] for item in logs.json()["items"]} == {
        IDS["workspace_newlife"]
    }
    remaining_logs = client.get(
        "/api/v1/internal/contact-logs?channel=email&ordering=created_at&limit=2&offset=2",
        headers=ops_headers,
    )
    assert remaining_logs.status_code == 200
    assert [item["workspace_id"] for item in remaining_logs.json()["items"]] == [
        IDS["workspace_aurora"]
    ]
    first_log = logs.json()["items"][0]
    log_detail = client.get(
        f"/api/v1/internal/contact-logs/{first_log['id']}", headers=ops_headers
    )
    assert log_detail.status_code == 200
    assert log_detail.json()["workspace_id"] == first_log["workspace_id"]
    assert log_detail.json()["merchant_name"]
    assert (
        client.get("/api/v1/internal/contact-logs/missing", headers=ops_headers).status_code
        == 404
    )

    products = client.get("/api/v1/internal/products", headers=ops_headers)
    assert products.status_code == 200, products.text
    assert products.json()["total"] == 3
    assert {item["workspace_id"] for item in products.json()["items"]} == {
        IDS["workspace_newlife"],
        IDS["workspace_aurora"],
    }
    lamp = client.get(
        f"/api/v1/internal/products/{IDS['product_lamp']}", headers=ops_headers
    )
    assert lamp.status_code == 200
    assert lamp.json()["workspace_id"] == IDS["workspace_aurora"]
    assert client.get("/api/v1/internal/products/missing", headers=ops_headers).status_code == 404

    variants = client.get(
        f"/api/v1/internal/variants?workspace_id={IDS['workspace_newlife']}"
        "&stock=out_of_stock&ordering=sku_code",
        headers=ops_headers,
    )
    assert variants.status_code == 200, variants.text
    assert variants.json()["total"] == 1
    assert [item["id"] for item in variants.json()["items"]] == [IDS["variant_charger"]]
    assert variants.json()["items"][0]["workspace_id"] == IDS["workspace_newlife"]

    multi_spec = client.get(
        "/api/v1/internal/variants?spec_key=Grade,Storage&spec_value=A,128GB",
        headers=ops_headers,
    )
    assert multi_spec.status_code == 200
    assert [item["id"] for item in multi_spec.json()["items"]] == [
        IDS["variant_iphone_a"]
    ]

    invalid_multi_spec = client.get(
        "/api/v1/internal/variants?spec_key=Grade,Storage&spec_value=A",
        headers=ops_headers,
    )
    assert invalid_multi_spec.status_code == 422

    specification_search = client.get(
        "/api/v1/internal/variants?search=UK",
        headers=ops_headers,
    )
    assert specification_search.status_code == 200
    assert [item["id"] for item in specification_search.json()["items"]] == [
        IDS["variant_lamp"]
    ]

    movements = client.get("/api/v1/internal/inventory-movements", headers=ops_headers)
    assert movements.status_code == 200
    assert movements.json()["total"] == 3
    assert {item["workspace_id"] for item in movements.json()["items"]} == {
        IDS["workspace_newlife"],
        IDS["workspace_aurora"],
    }
    paginated_movements = client.get(
        "/api/v1/internal/inventory-movements?ordering=created_at&page=2&page_size=1",
        headers=ops_headers,
    )
    assert paginated_movements.status_code == 200
    assert paginated_movements.json()["total"] == 3
    assert paginated_movements.json()["limit"] == 1
    assert paginated_movements.json()["offset"] == 1
    assert len(paginated_movements.json()["items"]) == 1

    filtered_movements = client.get(
        "/api/v1/internal/inventory-movements"
        "?search=newlife&ordering=quantity_delta&limit=1",
        headers=ops_headers,
    )
    assert filtered_movements.status_code == 200
    assert filtered_movements.json()["total"] == 2
    assert filtered_movements.json()["limit"] == 1
    assert filtered_movements.json()["items"][0]["workspace_id"] == (
        IDS["workspace_newlife"]
    )
    assert filtered_movements.json()["items"][0]["created_by"] == "newlife"

    dashboard = client.get("/api/v1/internal/dashboard/stats", headers=ops_headers)
    assert dashboard.status_code == 200, dashboard.text
    body = dashboard.json()
    assert body["workspace_count"] == 2
    assert body["lead_count"] == 4
    assert body["high_score_lead_count"] == 2
    assert body["contact_log_count"] == 4
    assert body["product_count"] == 3
    assert body["variant_count"] == 4
    assert body["category_count"] == 3
    assert body["lead_stages"] == {
        "contacting": 1,
        "new": 1,
        "qualified": 1,
        "quoting": 1,
    }
    assert body["latest_activity_time"] is not None
    assert {item["workspace_id"] for item in body["recent_leads"]} == {
        IDS["workspace_newlife"],
        IDS["workspace_aurora"],
    }
    assert all(item["workspace_name"] for item in body["recent_leads"])


def test_platform_cross_workspace_categories_specifications_and_trash(
    client: TestClient,
    ops_token: str,
):
    headers = auth_header(ops_token)

    categories = client.get(
        "/api/v1/internal/categories?ordering=name&limit=2",
        headers=headers,
    )
    assert categories.status_code == 200, categories.text
    assert categories.json()["total"] == 3
    assert categories.json()["limit"] == 2
    assert len(categories.json()["items"]) == 2
    assert all(item["workspace_name"] for item in categories.json()["items"])

    aurora_categories = client.get(
        f"/api/v1/internal/categories?workspace_id={IDS['workspace_aurora']}",
        headers=headers,
    )
    assert aurora_categories.status_code == 200
    assert [item["id"] for item in aurora_categories.json()["items"]] == [
        IDS["category_home"]
    ]

    all_options = client.get("/api/v1/internal/specification-options", headers=headers)
    assert all_options.status_code == 200
    assert all_options.json() == {
        "Grade": ["A", "B"],
        "Plug": ["EU", "UK"],
        "Storage": ["128GB"],
    }
    aurora_options = client.get(
        f"/api/v1/internal/specification-options?workspace_id={IDS['workspace_aurora']}",
        headers=headers,
    )
    assert aurora_options.status_code == 200
    assert aurora_options.json() == {"Plug": ["EU", "UK"]}

    for workspace_id, product_id in (
        (IDS["workspace_newlife"], IDS["product_iphone"]),
        (IDS["workspace_aurora"], IDS["product_lamp"]),
    ):
        deleted = client.delete(
            f"/api/v1/workspaces/{workspace_id}/products/{product_id}",
            headers=headers,
        )
        assert deleted.status_code == 204, deleted.text

    products = client.get("/api/v1/internal/products/trash", headers=headers)
    assert products.status_code == 200, products.text
    assert products.json()["total"] == 2
    assert {item["workspace_id"] for item in products.json()["items"]} == {
        IDS["workspace_newlife"],
        IDS["workspace_aurora"],
    }
    filtered_products = client.get(
        "/api/v1/internal/products/trash"
        f"?workspace_id={IDS['workspace_newlife']}&search=iphone",
        headers=headers,
    )
    assert filtered_products.status_code == 200
    assert [item["id"] for item in filtered_products.json()["items"]] == [
        IDS["product_iphone"]
    ]

    variants = client.get(
        "/api/v1/internal/variants/trash?ordering=sku_code",
        headers=headers,
    )
    assert variants.status_code == 200, variants.text
    assert variants.json()["total"] == 3
    assert {item["id"] for item in variants.json()["items"]} == {
        IDS["variant_iphone_a"],
        IDS["variant_iphone_b"],
        IDS["variant_lamp"],
    }
    aurora_variants = client.get(
        "/api/v1/internal/variants/trash"
        f"?workspace_id={IDS['workspace_aurora']}&search=UK",
        headers=headers,
    )
    assert aurora_variants.status_code == 200
    assert [item["id"] for item in aurora_variants.json()["items"]] == [
        IDS["variant_lamp"]
    ]


def test_platform_legacy_search_and_id_ordering_contracts(
    client: TestClient,
    ops_token: str,
):
    headers = auth_header(ops_token)
    contact_search = client.get(
        "/api/v1/internal/leads?search=Anna%20Weber",
        headers=headers,
    )
    assert contact_search.status_code == 200
    assert [item["id"] for item in contact_search.json()["items"]] == [IDS["lead_berlin"]]

    external_ref_search = client.get(
        "/api/v1/internal/leads?search=AMZ-FR-1028",
        headers=headers,
    )
    assert external_ref_search.status_code == 200
    assert [item["id"] for item in external_ref_search.json()["items"]] == [IDS["lead_paris"]]

    leads = client.get("/api/v1/internal/leads?ordering=-id", headers=headers)
    assert leads.status_code == 200
    lead_ids = [item["id"] for item in leads.json()["items"]]
    assert lead_ids == [
        IDS["lead_berlin"],
        IDS["lead_madrid"],
        IDS["lead_dubai"],
        IDS["lead_paris"],
    ]

    channel_search = client.get(
        "/api/v1/internal/contact-logs?search=whatsapp&ordering=id",
        headers=headers,
    )
    assert channel_search.status_code == 200
    assert channel_search.json()["total"] == 1
    assert channel_search.json()["items"][0]["lead_id"] == IDS["lead_madrid"]

    workspaces = client.get("/api/v1/workspaces?ordering=-id", headers=headers)
    assert workspaces.status_code == 200
    assert len(workspaces.json()["items"]) == 2


def test_platform_operator_uses_workspace_commands_for_audited_writes(
    client: TestClient,
    ops_token: str,
):
    headers = auth_header(ops_token)
    updated = client.patch(
        f"/api/v1/workspaces/{IDS['workspace_aurora']}/leads/{IDS['lead_dubai']}",
        headers=headers,
        json={"stage": "ordered"},
    )
    assert updated.status_code == 200
    assert updated.json()["stage"] == "ordered"
    detail = client.get(f"/api/v1/internal/leads/{IDS['lead_dubai']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["stage"] == "ordered"

    audits = client.get(
        "/api/v1/audit-logs?action=crm.lead_stage_changed", headers=headers
    )
    assert audits.status_code == 200
    assert any(item["entity_id"] == IDS["lead_dubai"] for item in audits.json())


def test_platform_catalog_supports_category_brand_stock_and_variant_filters(
    client: TestClient,
    ops_token: str,
):
    headers = auth_header(ops_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    parent = client.post(
        f"{base}/categories",
        headers=headers,
        json={"name": "Wearables"},
    )
    assert parent.status_code == 201
    brand = client.post(
        f"{base}/categories",
        headers=headers,
        json={"name": "Orbit", "parent_id": parent.json()["id"]},
    )
    assert brand.status_code == 201
    product = client.post(
        f"{base}/products",
        headers=headers,
        json={
            "name": "Orbit Trade Watch",
            "category_id": brand.json()["id"],
            "variants": [
                {
                    "sku_code": "ORBIT-WATCH-01",
                    "status": "inactive",
                    "stock_quantity": 12,
                    "price_tiers": [{"minimum_quantity": 1, "unit_price": "45.00"}],
                }
            ],
        },
    )
    assert product.status_code == 201, product.text

    products = client.get(
        "/api/v1/internal/products"
        f"?workspace_id={IDS['workspace_newlife']}&category_id={parent.json()['id']}"
        "&brand_name=orbit&stock=in_stock&ordering=name",
        headers=headers,
    )
    assert products.status_code == 200, products.text
    assert products.json()["total"] == 1
    assert [item["id"] for item in products.json()["items"]] == [product.json()["id"]]

    variants = client.get(
        "/api/v1/internal/variants"
        f"?workspace_id={IDS['workspace_newlife']}&brand_id={brand.json()['id']}"
        "&status=inactive&stock=in_stock&ordering=-stock_quantity&limit=1",
        headers=headers,
    )
    assert variants.status_code == 200, variants.text
    assert variants.json()["total"] == 1
    assert variants.json()["items"][0]["sku_code"] == "ORBIT-WATCH-01"
