import asyncio
import hashlib

from fastapi.testclient import TestClient

from tests.conftest import auth_header

NEWLIFE = "10000000-0000-0000-0000-000000000001"
AURORA = "10000000-0000-0000-0000-000000000002"
PARIS_LEAD = "20000000-0000-0000-0000-000000000001"
DUBAI_LEAD = "20000000-0000-0000-0000-000000000004"
IPHONE_A_VARIANT = "50000000-0000-0000-0000-000000000001"


def issue_key(client: TestClient, permissions: list[str], workspace_id: str = NEWLIFE):
    ops_login = client.post(
        "/api/v1/auth/login",
        json={"username": "ops", "password": "Mekyro123!"},
    )
    assert ops_login.status_code == 200
    response = client.post(
        "/api/v1/internal/api-keys",
        headers=auth_header(ops_login.json()["access_token"]),
        json={"name": "integration key", "permissions": permissions, "workspace_id": workspace_id},
    )
    assert response.status_code == 201, response.text
    return response.json(), ops_login.json()["access_token"]


def test_api_key_lifecycle_reveals_secret_once_and_requires_disable_before_revoke(
    client: TestClient,
):
    created, ops_token = issue_key(client, ["lead:read"])
    raw_key = created["key"]
    assert raw_key.startswith("mek_")
    assert created["key_prefix"] == raw_key[:8]
    assert "key_hash" not in created

    listing = client.get(
        "/api/v1/internal/api-keys?page=1&page_size=10",
        headers=auth_header(ops_token),
    )
    assert listing.status_code == 200
    item = next(row for row in listing.json()["keys"] if row["id"] == created["id"])
    assert item["key_prefix"] == created["key_prefix"]
    assert "key" not in item
    assert "key_hash" not in item

    enabled_delete = client.delete(
        f"/api/v1/internal/api-keys/{created['id']}",
        headers=auth_header(ops_token),
    )
    assert enabled_delete.status_code == 409

    disabled = client.patch(
        f"/api/v1/internal/api-keys/{created['id']}/status",
        headers=auth_header(ops_token),
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False
    revoked = client.delete(
        f"/api/v1/internal/api-keys/{created['id']}",
        headers=auth_header(ops_token),
    )
    assert revoked.status_code == 204
    assert (
        client.get("/api/v1/internal/api-keys", headers=auth_header(ops_token)).json()["total"] == 1
    )


def test_api_key_admin_update_and_non_admin_protection(client: TestClient, newlife_token: str):
    created, ops_token = issue_key(client, ["lead:read"])
    forbidden = client.get("/api/v1/internal/api-keys", headers=auth_header(newlife_token))
    assert forbidden.status_code == 403

    updated = client.patch(
        f"/api/v1/internal/api-keys/{created['id']}",
        headers=auth_header(ops_token),
        json={
            "name": "renamed",
            "permissions": ["lead:read", "lead:create"],
            "workspace_id": AURORA,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "renamed"
    assert updated.json()["workspace_id"] == AURORA
    assert updated.json()["permissions"] == ["lead:read", "lead:create"]


def test_api_key_auth_permission_tenant_scope_and_last_used(client: TestClient):
    created, _ = issue_key(client, ["lead:read", "product:read"])
    raw_key = created["key"]
    headers = {"X-Api-Key": raw_key}

    missing = client.get("/api/v1/external/leads")
    assert missing.status_code == 401
    invalid = client.get("/api/v1/external/leads", headers={"X-Api-Key": "mek_invalid"})
    assert invalid.status_code == 401

    leads = client.get("/api/v1/external/leads", headers=headers)
    assert leads.status_code == 200, leads.text
    assert leads.json()["total"] >= 1
    assert all(item["id"] != DUBAI_LEAD for item in leads.json()["items"])

    foreign = client.get(f"/api/v1/external/leads/{DUBAI_LEAD}", headers=headers)
    assert foreign.status_code == 404
    product_list = client.get("/api/v1/external/products", headers=headers)
    assert product_list.status_code == 200
    assert all(
        item["id"] != "40000000-0000-0000-0000-000000000003"
        for item in product_list.json()["items"]
    )

    async def read_key():
        async with client.app.state.database.sessions() as session:
            from sqlalchemy import select

            from app.core.models import ApiKey

            return await session.scalar(select(ApiKey).where(ApiKey.id == created["id"]))

    record = asyncio.run(read_key())
    assert record is not None
    assert record.key_hash == hashlib.sha256(raw_key.encode()).hexdigest()
    assert record.last_used_at is not None


def test_api_key_permission_enforced_and_scoped_write_audited(client: TestClient):
    read_key, _ = issue_key(client, ["lead:read"])
    denied = client.post(
        "/api/v1/external/leads",
        headers={"X-Api-Key": read_key["key"]},
        json={
            "merchant_name": "Blocked",
            "company_name": "Blocked Co",
            "country": "FR",
        },
    )
    assert denied.status_code == 403

    write_key, _ = issue_key(
        client, ["lead:create", "lead_contact_log:create", "lead_contact_log:read"]
    )
    created_lead = client.post(
        "/api/v1/external/leads",
        headers={"X-Api-Key": write_key["key"]},
        json={
            "merchant_name": "API Buyer",
            "company_name": "API Buyer GmbH",
            "country": "DE",
            "email": "buyer@example.com",
        },
    )
    assert created_lead.status_code == 201, created_lead.text
    lead_id = created_lead.json()["id"]
    activity = client.post(
        f"/api/v1/external/leads/{lead_id}/contact-logs",
        headers={"X-Api-Key": write_key["key"]},
        json={"channel": "email", "content": "Requested a quote"},
    )
    assert activity.status_code == 201, activity.text
    assert activity.json()["lead_id"] == lead_id


def test_api_key_reads_workspace_prompt_from_its_immutable_tenant_scope(client: TestClient):
    prompt_key, _ = issue_key(client, ["workspace:read"])
    response = client.get(
        "/api/v1/external/workspace/prompt",
        headers={"X-Api-Key": prompt_key["key"]},
    )
    assert response.status_code == 200
    assert response.json() == {
        "workspace_id": NEWLIFE,
        "workspace_name": "New Life Refurb Supply",
        "prompt": "",
        "daily_lead_limit": 0,
    }

    wrong_permission, _ = issue_key(client, ["lead:read"])
    denied = client.get(
        "/api/v1/external/workspace/prompt",
        headers={"X-Api-Key": wrong_permission["key"]},
    )
    assert denied.status_code == 403


def test_disabled_api_key_is_rejected(client: TestClient):
    created, ops_token = issue_key(client, ["lead:read"])
    changed = client.patch(
        f"/api/v1/internal/api-keys/{created['id']}/status",
        headers=auth_header(ops_token),
        json={"is_active": False},
    )
    assert changed.status_code == 200
    response = client.get("/api/v1/external/leads", headers={"X-Api-Key": created["key"]})
    assert response.status_code == 401


def test_api_key_catalog_and_inventory_commands_use_key_workspace(client: TestClient):
    created, _ = issue_key(
        client,
        [
            "product:read",
            "product:create",
            "product:update",
            "product:delete",
            "product_inventory:read",
            "product_inventory:create",
        ],
    )
    headers = {"X-Api-Key": created["key"]}
    category_response = client.post(
        "/api/v1/external/categories",
        headers=headers,
        json={"name": "API Key Category"},
    )
    assert category_response.status_code == 201, category_response.text
    category_id = category_response.json()["id"]

    product_response = client.post(
        "/api/v1/external/products",
        headers=headers,
        json={
            "category_id": category_id,
            "name": "API Key Product",
            "variants": [
                {
                    "sku_code": "API-KEY-SKU-001",
                    "stock_quantity": 4,
                    "price_tiers": [{"minimum_quantity": 1, "unit_price": "9.50"}],
                }
            ],
        },
    )
    assert product_response.status_code == 201, product_response.text
    product = product_response.json()
    product_id = product["id"]
    variant_id = product["variants"][0]["id"]

    updated = client.patch(
        f"/api/v1/external/products/{product_id}",
        headers=headers,
        json={"description": "Updated through an API key"},
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "Updated through an API key"

    tiers = client.put(
        f"/api/v1/external/variants/{variant_id}/price-tiers",
        headers=headers,
        json=[
            {"minimum_quantity": 1, "unit_price": "8.75"},
            {"minimum_quantity": 10, "unit_price": "7.50"},
        ],
    )
    assert tiers.status_code == 200, tiers.text
    assert [item["minimum_quantity"] for item in tiers.json()] == [1, 10]

    movement = client.post(
        "/api/v1/external/inventory-adjustments",
        headers={**headers, "Idempotency-Key": "api-key-stock-001"},
        json={
            "variant_id": variant_id,
            "movement_type": "inbound",
            "quantity_delta": 6,
            "reason": "API key replenishment",
        },
    )
    assert movement.status_code == 201, movement.text
    assert movement.json()["balance_after"] == 10
    movements = client.get("/api/v1/external/inventory-movements", headers=headers)
    assert movements.status_code == 200
    assert any(item["variant_id"] == variant_id for item in movements.json()["items"])

    deleted = client.delete(f"/api/v1/external/products/{product_id}", headers=headers)
    assert deleted.status_code == 204
    foreign_catalog = client.get(
        "/api/v1/external/products/40000000-0000-0000-0000-000000000003",
        headers=headers,
    )
    assert foreign_catalog.status_code == 404


def test_external_api_key_crm_full_lifecycle_and_batches(client: TestClient):
    created, _ = issue_key(
        client,
        [
            "lead:read",
            "lead:create",
            "lead:update",
            "lead:delete",
            "lead_contact_log:read",
            "lead_contact_log:create",
            "lead_contact_log:update",
            "lead_contact_log:delete",
        ],
    )
    headers = {"X-Api-Key": created["key"]}
    batch = client.post(
        "/api/v1/external/leads/batch",
        headers=headers,
        json={
            "items": [
                {
                    "source": "manual",
                    "external_ref": "EXT-CRM-001",
                    "merchant_name": "External Merchant One",
                    "company_name": "External One Ltd",
                    "country": "gb",
                },
                {
                    "source": "website",
                    "external_ref": "EXT-CRM-002",
                    "merchant_name": "External Merchant Two",
                    "company_name": "External Two GmbH",
                    "country": "de",
                },
            ]
        },
    )
    assert batch.status_code == 201, batch.text
    lead_ids = [item["id"] for item in batch.json()]

    listing = client.get("/api/v1/external/leads?search=External%20Merchant", headers=headers)
    assert listing.status_code == 200
    assert set(lead_ids).issubset({item["id"] for item in listing.json()["items"]})
    filtered = client.get(
        "/api/v1/external/leads?stage=new&country=GB&source=manual&limit=1&offset=0",
        headers=headers,
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["id"] == lead_ids[0]
    legacy_filtered = client.get(
        "/api/v1/external/leads?stage=new&country=GB&platform=manual&page_size=1",
        headers=headers,
    )
    assert legacy_filtered.status_code == 200
    assert legacy_filtered.json()["total"] == 1
    assert legacy_filtered.json()["limit"] == 1
    assert legacy_filtered.json()["offset"] == 0
    assert legacy_filtered.json()["items"][0]["id"] == lead_ids[0]
    conflicting_source = client.get(
        "/api/v1/external/leads?source=manual&platform=website",
        headers=headers,
    )
    assert conflicting_source.status_code == 422
    detail = client.get(f"/api/v1/external/leads/{lead_ids[0]}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["country"] == "GB"
    updated = client.patch(
        f"/api/v1/external/leads/{lead_ids[0]}",
        headers=headers,
        json={"stage": "contacting", "description": "Updated by external CRM"},
    )
    assert updated.status_code == 200
    assert updated.json()["stage"] == "contacting"

    activities = client.post(
        f"/api/v1/external/leads/{lead_ids[0]}/contact-logs/batch",
        headers=headers,
        json={
            "items": [
                {
                    "activity_type": "ai_outbound",
                    "channel": "email",
                    "subject": "External introduction",
                    "content": "Introduced the current catalog.",
                },
                {
                    "activity_type": "customer_inbound",
                    "channel": "whatsapp",
                    "content": "Requested pricing and MOQ.",
                },
            ]
        },
    )
    assert activities.status_code == 201, activities.text
    activity_ids = [item["id"] for item in activities.json()]
    activity_list = client.get(
        f"/api/v1/external/leads/{lead_ids[0]}/contact-logs", headers=headers
    )
    assert activity_list.status_code == 200
    assert activity_list.json()["total"] == 2
    assert set(activity_ids) == {item["id"] for item in activity_list.json()["items"]}
    activity_detail = client.get(
        f"/api/v1/external/contact-logs/{activity_ids[0]}", headers=headers
    )
    assert activity_detail.status_code == 200
    activity_update = client.patch(
        f"/api/v1/external/contact-logs/{activity_ids[0]}",
        headers=headers,
        json={"activity_type": "customer_inbound", "content": "Customer replied."},
    )
    assert activity_update.status_code == 200
    assert activity_update.json()["direction"] == "inbound"
    for activity_id in activity_ids:
        assert (
            client.delete(f"/api/v1/external/contact-logs/{activity_id}", headers=headers).status_code
            == 204
        )
    for lead_id in lead_ids:
        assert client.delete(f"/api/v1/external/leads/{lead_id}", headers=headers).status_code == 204
        assert client.get(f"/api/v1/external/leads/{lead_id}", headers=headers).status_code == 404


def test_external_api_key_catalog_variant_price_and_inventory_batches(client: TestClient):
    created, _ = issue_key(
        client,
        [
            "product:read",
            "product:create",
            "product:update",
            "product:delete",
            "product_inventory:read",
            "product_inventory:create",
        ],
    )
    headers = {"X-Api-Key": created["key"]}

    multi_spec = client.get(
        "/api/v1/external/variants?spec_key=Grade,Storage&spec_value=A,128GB",
        headers=headers,
    )
    assert multi_spec.status_code == 200
    assert [item["id"] for item in multi_spec.json()] == [IPHONE_A_VARIANT]

    invalid_multi_spec = client.get(
        "/api/v1/external/variants?spec_key=Grade,Storage&spec_value=A",
        headers=headers,
    )
    assert invalid_multi_spec.status_code == 422

    disposable = client.post(
        "/api/v1/external/categories", headers=headers, json={"name": "Disposable Category"}
    )
    assert disposable.status_code == 201
    disposable_id = disposable.json()["id"]
    assert client.get(f"/api/v1/external/categories/{disposable_id}", headers=headers).status_code == 200
    renamed = client.patch(
        f"/api/v1/external/categories/{disposable_id}",
        headers=headers,
        json={"name": "Renamed Disposable Category", "sort_order": 7},
    )
    assert renamed.status_code == 200
    assert renamed.json()["sort_order"] == 7
    assert client.delete(f"/api/v1/external/categories/{disposable_id}", headers=headers).status_code == 204

    category = client.post(
        "/api/v1/external/categories", headers=headers, json={"name": "External Batch Catalog"}
    )
    assert category.status_code == 201
    brand = client.post(
        "/api/v1/external/categories",
        headers=headers,
        json={"name": "External Test Brand", "parent_id": category.json()["id"]},
    )
    assert brand.status_code == 201
    categories = client.get("/api/v1/external/categories", headers=headers)
    assert categories.status_code == 200
    assert {category.json()["id"], brand.json()["id"]} <= {
        item["id"] for item in categories.json()
    }
    product = client.post(
        "/api/v1/external/products",
        headers=headers,
        json={
            "category_id": brand.json()["id"],
            "name": "External Batch Product",
            "variants": [
                {
                    "sku_code": "EXT-BATCH-A",
                    "stock_quantity": 10,
                    "price_tiers": [{"minimum_quantity": 1, "unit_price": "20.00"}],
                }
            ],
        },
    )
    assert product.status_code == 201, product.text
    product_id = product.json()["id"]
    first_variant_id = product.json()["variants"][0]["id"]
    filtered_products = client.get(
        "/api/v1/external/products?brand_name=external%20test%20brand&status=active"
        "&include_skus=true&page=1&page_size=1",
        headers=headers,
    )
    assert filtered_products.status_code == 200
    assert filtered_products.json()["limit"] == 1
    assert filtered_products.json()["offset"] == 0
    assert [item["id"] for item in filtered_products.json()["items"]] == [product_id]
    filtered_by_brand_id = client.get(
        f"/api/v1/external/products?brand_id={brand.json()['id']}",
        headers=headers,
    )
    assert filtered_by_brand_id.status_code == 200
    assert [item["id"] for item in filtered_by_brand_id.json()["items"]] == [product_id]
    assert client.get(f"/api/v1/external/products/{product_id}", headers=headers).status_code == 200

    second_variant = client.post(
        f"/api/v1/external/products/{product_id}/variants",
        headers=headers,
        json={
            "sku_code": "EXT-BATCH-B",
            "stock_quantity": 20,
            "minimum_order_quantity": 2,
            "price_tiers": [{"minimum_quantity": 2, "unit_price": "18.00"}],
        },
    )
    assert second_variant.status_code == 201, second_variant.text
    second_variant_id = second_variant.json()["id"]
    variants = client.get(
        "/api/v1/external/variants?search=EXT-BATCH&ordering=-stock_quantity&page=1&page_size=10",
        headers=headers,
    )
    assert variants.status_code == 200
    assert {first_variant_id, second_variant_id}.issubset(
        {item["id"] for item in variants.json()}
    )
    variant_detail = client.get(
        f"/api/v1/external/variants/{second_variant_id}", headers=headers
    )
    assert variant_detail.status_code == 200
    variant_update = client.patch(
        f"/api/v1/external/variants/{second_variant_id}",
        headers=headers,
        json={"minimum_order_quantity": 5, "specifications": {"Color": "Black"}},
    )
    assert variant_update.status_code == 200
    assert variant_update.json()["minimum_order_quantity"] == 5

    single_tiers = client.put(
        f"/api/v1/external/variants/{first_variant_id}/price-tiers",
        headers=headers,
        json=[
            {"minimum_quantity": 1, "unit_price": "19.00"},
            {"minimum_quantity": 10, "unit_price": "17.00"},
        ],
    )
    assert single_tiers.status_code == 200
    batch_variants = client.patch(
        "/api/v1/external/batch/variants",
        headers=headers,
        json=[
            {"id": first_variant_id, "minimum_order_quantity": 3},
            {"id": second_variant_id, "status": "inactive"},
        ],
    )
    assert batch_variants.status_code == 200, batch_variants.text
    batch_prices = client.put(
        "/api/v1/external/batch/price-tiers",
        headers=headers,
        json=[
            {
                "variant_id": first_variant_id,
                "price_tiers": [{"minimum_quantity": 3, "unit_price": "16.00"}],
            },
            {
                "variant_id": second_variant_id,
                "price_tiers": [{"minimum_quantity": 5, "unit_price": "15.00"}],
            },
        ],
    )
    assert batch_prices.status_code == 200, batch_prices.text

    inventory = client.post(
        "/api/v1/external/batch/inventory-adjustments",
        headers={**headers, "Idempotency-Key": "external-inventory-batch-001"},
        json=[
            {
                "variant_id": first_variant_id,
                "movement_type": "inbound",
                "quantity_delta": 4,
                "reason": "External batch receipt",
            },
            {
                "variant_id": second_variant_id,
                "movement_type": "outbound",
                "quantity_delta": -3,
                "reason": "External batch allocation",
            },
        ],
    )
    assert inventory.status_code == 201, inventory.text
    assert [item["balance_after"] for item in inventory.json()["items"]] == [14, 17]
    movements = client.get(
        "/api/v1/external/inventory-movements?page_size=1",
        headers=headers,
    )
    assert movements.status_code == 200
    assert movements.json()["limit"] == 1
    assert movements.json()["offset"] == 0
    assert len(movements.json()["items"]) == 1
    next_movement = client.get(
        "/api/v1/external/inventory-movements?page=2&page_size=1",
        headers=headers,
    )
    assert next_movement.status_code == 200
    assert next_movement.json()["limit"] == 1
    assert next_movement.json()["offset"] == 1
    assert {
        movements.json()["items"][0]["variant_id"],
        next_movement.json()["items"][0]["variant_id"],
    } == {first_variant_id, second_variant_id}

    assert (
        client.delete(f"/api/v1/external/variants/{second_variant_id}", headers=headers).status_code
        == 204
    )
    assert client.get(f"/api/v1/external/variants/{second_variant_id}", headers=headers).status_code == 404
    assert client.delete(f"/api/v1/external/products/{product_id}", headers=headers).status_code == 204
