import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.core.models import (
    OutboxMessage,
    Product,
    ProductImage,
    ProductVariant,
    ShopifyConfig,
    new_id,
)
from app.core.secrets import decrypt_secret, encrypt_secret
from app.modules.shopify.client import (
    ShopifyClient,
    ShopifyGraphQLError,
    clear_shopify_caches,
)
from app.modules.shopify.sync import (
    ShopifyProductSyncService,
    claim_shopify_outbox_message,
    process_shopify_outbox_message,
)
from tests.conftest import auth_header

NEWLIFE = "10000000-0000-0000-0000-000000000001"
PRODUCT_ID = "40000000-0000-0000-0000-000000000001"


def _login_ops(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "ops", "password": "Mekyro123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_shopify_config_lifecycle_encrypts_and_redacts_credentials(
    client: TestClient,
    newlife_token: str,
):
    ops_token = _login_ops(client)
    initial = client.get("/api/v1/internal/shopify-configs", headers=auth_header(ops_token))
    assert initial.status_code == 200
    assert initial.json()["total"] == 2
    assert all("api_secret_key" not in item for item in initial.json()["configs"])
    assert (
        client.get(
            "/api/v1/internal/shopify-configs", headers=auth_header(newlife_token)
        ).status_code
        == 403
    )

    created = client.post(
        "/api/v1/internal/shopify-configs",
        headers=auth_header(ops_token),
        json={"workspace_id": NEWLIFE},
    )
    assert created.status_code == 201, created.text
    config_id = created.json()["config_id"]
    incomplete = client.patch(
        f"/api/v1/internal/shopify-configs/{config_id}/status",
        headers=auth_header(ops_token),
        json={"is_active": True},
    )
    assert incomplete.status_code == 409

    updated = client.patch(
        f"/api/v1/internal/shopify-configs/{config_id}",
        headers=auth_header(ops_token),
        json={
            "store_url": "https://newlife-dev.myshopify.com/",
            "api_key": "shopify-client-id",
            "api_secret_key": "shopify-client-secret",
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["store_url"] == "https://newlife-dev.myshopify.com"
    assert body["api_key_masked"].endswith("t-id")
    assert body["api_secret_key_masked"].endswith("cret")
    assert "shopify-client-secret" not in updated.text

    async def read_config():
        async with client.app.state.database.sessions() as session:
            return await session.scalar(select(ShopifyConfig).where(ShopifyConfig.id == config_id))

    stored = asyncio.run(read_config())
    assert stored is not None
    assert stored.api_key_encrypted != "shopify-client-id"
    assert stored.api_secret_encrypted != "shopify-client-secret"
    settings = Settings()
    assert decrypt_secret(stored.api_secret_encrypted, settings) == "shopify-client-secret"

    enabled = client.patch(
        f"/api/v1/internal/shopify-configs/{config_id}/status",
        headers=auth_header(ops_token),
        json={"is_active": True},
    )
    assert enabled.status_code == 200
    assert enabled.json()["is_ready"] is True
    duplicate = client.post(
        "/api/v1/internal/shopify-configs",
        headers=auth_header(ops_token),
        json={"workspace_id": NEWLIFE},
    )
    assert duplicate.status_code == 409
    assert (
        client.delete(
            f"/api/v1/internal/shopify-configs/{config_id}", headers=auth_header(ops_token)
        ).status_code
        == 409
    )

    disabled = client.patch(
        f"/api/v1/internal/shopify-configs/{config_id}/status",
        headers=auth_header(ops_token),
        json={"is_active": False},
    )
    assert disabled.status_code == 200
    assert (
        client.delete(
            f"/api/v1/internal/shopify-configs/{config_id}", headers=auth_header(ops_token)
        ).status_code
        == 204
    )


def test_supplier_can_manage_own_shopify_profile_with_encrypted_credentials(
    client: TestClient,
    newlife_token: str,
):
    base = f"/api/v1/workspaces/{NEWLIFE}/shopify/config"
    headers = auth_header(newlife_token)
    initial = client.get(base, headers=headers)
    assert initial.status_code == 200
    assert initial.json()["has_config"] is False
    assert initial.json()["api_key_configured"] is False

    cross_tenant = client.get(
        "/api/v1/workspaces/10000000-0000-0000-0000-000000000002/shopify/config",
        headers=headers,
    )
    assert cross_tenant.status_code == 403

    created = client.put(
        base,
        headers=headers,
        json={
            "store_url": "https://self-service.myshopify.com/",
            "api_key": "supplier-client-id",
            "api_secret_key": "supplier-client-secret",
            "api_version": "2026-04",
        },
    )
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["has_config"] is True
    assert body["store_url"] == "https://self-service.myshopify.com"
    assert body["api_key_configured"] is True
    assert body["api_secret_key_configured"] is True
    assert body["is_active"] is False
    assert "supplier-client-id" not in created.text
    assert "supplier-client-secret" not in created.text

    async def read_config_and_audit():
        async with client.app.state.database.sessions() as session:
            from app.core.models import AuditLog

            config = await session.scalar(
                select(ShopifyConfig).where(ShopifyConfig.workspace_id == NEWLIFE)
            )
            audit = await session.scalar(
                select(AuditLog)
                .where(
                    AuditLog.workspace_id == NEWLIFE,
                    AuditLog.action == "shopify.config_created",
                )
                .order_by(AuditLog.created_at.desc())
            )
            return config, audit

    stored, audit = asyncio.run(read_config_and_audit())
    assert stored is not None
    assert stored.api_key_encrypted != "supplier-client-id"
    assert stored.api_secret_encrypted != "supplier-client-secret"
    assert decrypt_secret(stored.api_key_encrypted, Settings()) == "supplier-client-id"
    assert audit is not None
    assert "api_secret_key" in audit.payload["fields"]
    assert "supplier-client-secret" not in str(audit.payload)

    ops_token = _login_ops(client)
    enabled = client.patch(
        f"/api/v1/internal/shopify-configs/{stored.id}/status",
        headers=auth_header(ops_token),
        json={"is_active": True},
    )
    assert enabled.status_code == 200
    updated = client.put(
        base,
        headers=headers,
        json={"store_url": "https://renamed-shop.myshopify.com"},
    )
    assert updated.status_code == 200
    assert updated.json()["store_url"] == "https://renamed-shop.myshopify.com"
    assert updated.json()["api_key_configured"] is True
    assert updated.json()["is_active"] is False

    empty = client.put(base, headers=headers, json={})
    assert empty.status_code == 422
    insecure_url = client.put(base, headers=headers, json={"store_url": "http://bad.example"})
    assert insecure_url.status_code == 422


def test_shopify_sync_job_is_workspace_scoped_and_idempotent(
    client: TestClient,
    newlife_token: str,
):
    ops_token = _login_ops(client)
    created = client.post(
        "/api/v1/internal/shopify-configs",
        headers=auth_header(ops_token),
        json={
            "workspace_id": NEWLIFE,
            "store_url": "https://newlife-dev.myshopify.com",
            "api_key": "client-id",
            "api_secret_key": "client-secret",
        },
    )
    config_id = created.json()["config_id"]
    client.patch(
        f"/api/v1/internal/shopify-configs/{config_id}/status",
        headers=auth_header(ops_token),
        json={"is_active": True},
    )
    headers = {**auth_header(newlife_token), "Idempotency-Key": "shopify-job-001"}
    first = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/shopify/sync-jobs",
        headers=headers,
        json={"operation": "full", "product_ids": [PRODUCT_ID]},
    )
    assert first.status_code == 201, first.text
    replay = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/shopify/sync-jobs",
        headers=headers,
        json={"operation": "full", "product_ids": [PRODUCT_ID]},
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]
    jobs = client.get(
        f"/api/v1/workspaces/{NEWLIFE}/shopify/sync-jobs",
        headers=auth_header(newlife_token),
    )
    assert jobs.status_code == 200
    assert [item["id"] for item in jobs.json()] == [first.json()["id"]]


def test_active_shopify_config_enqueues_catalog_inventory_and_delete_events(
    client: TestClient,
    newlife_token: str,
):
    ops_token = _login_ops(client)
    config = client.post(
        "/api/v1/internal/shopify-configs",
        headers=auth_header(ops_token),
        json={
            "workspace_id": NEWLIFE,
            "store_url": "https://newlife-dev.myshopify.com",
            "api_key": "client-id",
            "api_secret_key": "client-secret",
        },
    ).json()
    client.patch(
        f"/api/v1/internal/shopify-configs/{config['config_id']}/status",
        headers=auth_header(ops_token),
        json={"is_active": True},
    )

    update_response = client.patch(
        f"/api/v1/workspaces/{NEWLIFE}/products/{PRODUCT_ID}",
        headers=auth_header(newlife_token),
        json={"description": "Queued Shopify update"},
    )
    assert update_response.status_code == 200
    inventory_response = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/inventory-adjustments",
        headers={**auth_header(newlife_token), "Idempotency-Key": "shopify-auto-stock-001"},
        json={
            "variant_id": "50000000-0000-0000-0000-000000000001",
            "movement_type": "inbound",
            "quantity_delta": 1,
            "reason": "Shopify auto event",
        },
    )
    assert inventory_response.status_code == 201
    image = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/products/{PRODUCT_ID}/images",
        headers=auth_header(newlife_token),
        json={"image_type": "product", "url": "https://img.example.com/outbox.jpg"},
    )
    assert image.status_code == 201
    assert client.delete(
        f"/api/v1/workspaces/{NEWLIFE}/products/{PRODUCT_ID}/images/{image.json()['id']}",
        headers=auth_header(newlife_token),
    ).status_code == 204
    delete_response = client.delete(
        f"/api/v1/workspaces/{NEWLIFE}/products/{PRODUCT_ID}",
        headers=auth_header(newlife_token),
    )
    assert delete_response.status_code == 204

    jobs = client.get(
        f"/api/v1/workspaces/{NEWLIFE}/shopify/sync-jobs",
        headers=auth_header(newlife_token),
    )
    assert jobs.status_code == 200
    assert {item["operation"] for item in jobs.json()} == {"catalog", "inventory", "delete"}
    assert sum(item["operation"] == "catalog" for item in jobs.json()) >= 3


def test_catalog_import_enqueues_all_created_products_for_shopify(
    client: TestClient,
    newlife_token: str,
):
    ops_token = _login_ops(client)
    config = client.post(
        "/api/v1/internal/shopify-configs",
        headers=auth_header(ops_token),
        json={
            "workspace_id": NEWLIFE,
            "store_url": "https://newlife-import.myshopify.com",
            "api_key": "client-id",
            "api_secret_key": "client-secret",
        },
    ).json()
    client.patch(
        f"/api/v1/internal/shopify-configs/{config['config_id']}/status",
        headers=auth_header(ops_token),
        json={"is_active": True},
    )
    imported = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/product-import/confirm",
        headers=auth_header(newlife_token),
        json={
            "rows": [
                {
                    "row": 2,
                    "product_name": "Shopify Imported Product",
                    "category_path": "Imported/Shopify",
                    "description": "Imported through the staged workflow",
                    "sku_code": "SHOPIFY-IMPORT-001",
                    "specs": {"Color": "Black"},
                    "moq": 5,
                    "currency": "USD",
                    "stock_quantity": 9,
                    "status": "active",
                    "unit_price": 12.5,
                    "product_images": ["https://img.example.com/imported.jpg"],
                    "product_detail_image": "",
                    "sku_image": "https://img.example.com/imported-sku.jpg",
                }
            ]
        },
    )
    assert imported.status_code == 201, imported.text
    jobs = client.get(
        f"/api/v1/workspaces/{NEWLIFE}/shopify/sync-jobs",
        headers=auth_header(newlife_token),
    ).json()
    assert len(jobs) == 1
    assert jobs[0]["operation"] == "catalog"
    assert len(jobs[0]["product_ids"]) == 1


def _client_config(settings: Settings, workspace_id: str = NEWLIFE) -> ShopifyConfig:
    return ShopifyConfig(
        id="shopify-config-test",
        workspace_id=workspace_id,
        store_url="https://unit-test.myshopify.com",
        api_version="2026-04",
        api_key_encrypted=encrypt_secret("client-id", settings),
        api_secret_encrypted=encrypt_secret("client-secret", settings),
        grant_type="client_credentials",
        is_active=True,
    )


@pytest.mark.asyncio
async def test_shopify_client_token_graphql_retry_and_location_cache():
    clear_shopify_caches()
    calls = {"token": 0, "graphql": 0, "location": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/admin/oauth/access_token"):
            calls["token"] += 1
            return httpx.Response(
                200, json={"access_token": f"token-{calls['token']}", "expires_in": 3600}
            )
        calls["graphql"] += 1
        body = request.content.decode()
        if "MekyroLocations" in body:
            calls["location"] += 1
            return httpx.Response(
                200,
                json={
                    "data": {
                        "locations": {
                            "edges": [
                                {
                                    "node": {
                                        "id": "gid://shopify/Location/1",
                                        "name": "Main",
                                        "isActive": True,
                                    }
                                }
                            ]
                        }
                    }
                },
            )
        if calls["graphql"] == 1:
            return httpx.Response(429, headers={"Retry-After": "0"}, json={"error": "limited"})
        return httpx.Response(200, json={"data": {"shop": {"name": "Unit Shop"}}})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        shopify = ShopifyClient(
            _client_config(Settings()),
            Settings(),
            http_client=http_client,
            retry_base_seconds=0,
        )
        data = await shopify.execute("query { shop { name } }")
        assert data["shop"]["name"] == "Unit Shop"
        assert calls["token"] == 1
        assert await shopify.get_location_id() == "gid://shopify/Location/1"
        assert await shopify.get_location_id() == "gid://shopify/Location/1"
        assert calls["location"] == 1


@pytest.mark.asyncio
async def test_shopify_client_refreshes_401_and_maps_graphql_errors():
    clear_shopify_caches()
    calls = {"token": 0, "graphql": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/admin/oauth/access_token"):
            calls["token"] += 1
            return httpx.Response(
                200, json={"access_token": f"token-{calls['token']}", "expires_in": 3600}
            )
        calls["graphql"] += 1
        if calls["graphql"] == 1:
            return httpx.Response(401, json={"error": "expired"})
        if calls["graphql"] == 2:
            return httpx.Response(200, json={"data": {"shop": {"name": "Refreshed"}}})
        return httpx.Response(200, json={"errors": [{"message": "bad query"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        shopify = ShopifyClient(_client_config(Settings()), Settings(), http_client=http_client)
        assert (await shopify.execute("query { shop { name } }"))["shop"]["name"] == "Refreshed"
        assert calls["token"] == 2
        with pytest.raises(ShopifyGraphQLError):
            await shopify.execute("query { broken }")


def test_shopify_outbox_worker_syncs_catalog_inventory_and_remote_ids(
    client: TestClient,
    newlife_token: str,
):
    ops_token = _login_ops(client)
    created = client.post(
        "/api/v1/internal/shopify-configs",
        headers=auth_header(ops_token),
        json={
            "workspace_id": NEWLIFE,
            "store_url": "https://newlife-dev.myshopify.com",
            "api_key": "client-id",
            "api_secret_key": "client-secret",
        },
    )
    config_id = created.json()["config_id"]
    client.patch(
        f"/api/v1/internal/shopify-configs/{config_id}/status",
        headers=auth_header(ops_token),
        json={"is_active": True},
    )
    job_response = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/shopify/sync-jobs",
        headers={**auth_header(newlife_token), "Idempotency-Key": "worker-job-001"},
        json={"operation": "catalog", "product_ids": [PRODUCT_ID]},
    )
    job_id = job_response.json()["id"]

    class FakeGateway:
        def __init__(self):
            self.calls = []
            self.closed = False

        async def execute(self, query, variables=None, **_kwargs):
            self.calls.append((query, variables))
            if "MekyroProductSet" in query:
                variants = variables["input"]["variants"]
                return {
                    "productSet": {
                        "product": {
                            "id": "gid://shopify/Product/1001",
                            "variants": {
                                "nodes": [
                                    {
                                        "id": f"gid://shopify/ProductVariant/{index}",
                                        "sku": item["sku"],
                                        "inventoryItem": {
                                            "id": f"gid://shopify/InventoryItem/{index}"
                                        },
                                    }
                                    for index, item in enumerate(variants, start=1)
                                ]
                            },
                        }
                    }
                }
            if "MekyroProductMedia" in query and "mutation" not in query:
                return {
                    "product": {
                        "media": {"nodes": [{"id": "gid://shopify/MediaImage/old"}]}
                    }
                }
            if "MekyroProductMediaDelete" in query:
                return {"productDeleteMedia": {"deletedMediaIds": variables["mediaIds"]}}
            if "MekyroProductMediaCreate" in query:
                return {
                    "productCreateMedia": {
                        "media": [
                            {
                                "id": f"gid://shopify/MediaImage/{index}",
                                "alt": item["alt"],
                            }
                            for index, item in enumerate(variables["media"], start=1)
                        ]
                    }
                }
            if "MekyroVariantMediaAssign" in query:
                return {"productVariantsBulkUpdate": {"productVariants": []}}
            if "MekyroPublications" in query:
                return {
                    "publications": {
                        "nodes": [
                            {"id": "gid://shopify/Publication/1", "name": "Online Store"}
                        ]
                    }
                }
            if "MekyroPublishProduct" in query:
                return {
                    "publishablePublish": {
                        "publishable": {"publishedOnCurrentPublication": True}
                    }
                }
            return {"inventorySetQuantities": {"inventoryAdjustmentGroup": {"createdAt": "now"}}}

        async def get_location_id(self):
            return "gid://shopify/Location/1"

        async def close(self):
            self.closed = True

    gateway = FakeGateway()

    async def process_and_read():
        async with client.app.state.database.sessions() as session:
            product = await session.get(Product, PRODUCT_ID)
            product.external_ids = {}
            variants = (
                await session.scalars(
                    select(ProductVariant).where(ProductVariant.product_id == PRODUCT_ID)
                )
            ).all()
            for variant in variants:
                variant.external_ids = {}
            session.add_all(
                [
                    ProductImage(
                        id=new_id(),
                        product_id=PRODUCT_ID,
                        image_type="product",
                        file_key="https://img.example.com/iphone-gallery.jpg",
                    ),
                    ProductImage(
                        id=new_id(),
                        product_id=PRODUCT_ID,
                        image_type="product_detail",
                        file_key="https://img.example.com/iphone-detail.jpg",
                    ),
                    ProductImage(
                        id=new_id(),
                        variant_id="50000000-0000-0000-0000-000000000001",
                        image_type="sku",
                        file_key="https://img.example.com/iphone-sku.jpg",
                    ),
                ]
            )
            await session.commit()
            message = await process_shopify_outbox_message(
                session,
                job_id,
                Settings(),
                gateway_factory=lambda _config, _settings: gateway,
            )
            product = await session.get(Product, PRODUCT_ID)
            variants = (
                await session.scalars(
                    select(ProductVariant).where(ProductVariant.product_id == PRODUCT_ID)
                )
            ).all()
            return message, product, variants

    message, product, variants = asyncio.run(process_and_read())
    assert message.status == "processed"
    assert message.payload["result"] == {
        "operation": "catalog",
        "product_count": 1,
        "inventory_variant_count": 2,
        "media_count": 2,
    }
    assert product.external_ids["shopify_product_id"] == "gid://shopify/Product/1001"
    assert all(item.external_ids["shopify_inventory_item_id"] for item in variants)
    assert any("MekyroInventorySet" in query for query, _variables in gateway.calls)
    product_set = next(
        variables for query, variables in gateway.calls if "MekyroProductSet" in query
    )
    assert product_set["input"]["vendor"] == "mekyro"
    assert product_set["input"]["productType"] == "Mobile Phones"
    assert product_set["identifier"] is None
    assert "iphone-detail.jpg" in product_set["input"]["descriptionHtml"]
    created_media = next(
        variables for query, variables in gateway.calls if "MekyroProductMediaCreate" in query
    )
    assert {item["originalSource"] for item in created_media["media"]} == {
        "https://img.example.com/iphone-gallery.jpg",
        "https://img.example.com/iphone-sku.jpg",
    }
    assert any("MekyroProductMediaDelete" in query for query, _variables in gateway.calls)
    assert any("MekyroVariantMediaAssign" in query for query, _variables in gateway.calls)
    assert any("MekyroPublishProduct" in query for query, _variables in gateway.calls)
    assert gateway.closed is True


def test_shopify_mapping_preserves_hierarchical_categories_and_extra_specifications(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    root = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/categories",
        headers=headers,
        json={"name": "Electronics"},
    )
    assert root.status_code == 201, root.text
    branch = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/categories",
        headers=headers,
        json={"name": "Nested Mobile Phones", "parent_id": root.json()["id"]},
    )
    assert branch.status_code == 201, branch.text
    leaf = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/categories",
        headers=headers,
        json={"name": "Smartphones", "parent_id": branch.json()["id"]},
    )
    assert leaf.status_code == 201, leaf.text
    created = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/products",
        headers=headers,
        json={
            "name": "Four-option phone",
            "category_id": leaf.json()["id"],
            "description": "A phone with extended specifications",
            "status": "active",
            "specification_template": [
                {"name": "storage", "options": ["256GB"]},
                {"name": "color", "options": ["Black"]},
                {"name": "version", "options": ["Global"]},
                {"name": "sim_slot", "options": ["Dual"]},
            ],
            "variants": [
                {
                    "sku_code": "FOUR-OPTION-001",
                    "specifications": {
                        "storage": "256GB",
                        "color": "Black",
                        "version": "Global",
                        "sim_slot": "Dual",
                    },
                    "minimum_order_quantity": 1,
                    "currency": "USD",
                    "stock_quantity": 4,
                    "status": "active",
                    "price_tiers": [{"minimum_quantity": 1, "unit_price": 599}],
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    product_id = created.json()["id"]

    class FakeGateway:
        def __init__(self):
            self.product_input = None

        async def execute(self, query, variables=None, **_kwargs):
            if "MekyroProductSet" in query:
                self.product_input = variables["input"]
                variant = self.product_input["variants"][0]
                return {
                    "productSet": {
                        "product": {
                            "id": "gid://shopify/Product/four-options",
                            "variants": {
                                "nodes": [
                                    {
                                        "id": "gid://shopify/ProductVariant/four-options",
                                        "sku": variant["sku"],
                                        "inventoryItem": {
                                            "id": "gid://shopify/InventoryItem/four-options"
                                        },
                                    }
                                ]
                            },
                        }
                    }
                }
            if "MekyroProductMedia" in query and "mutation" not in query:
                return {"product": {"media": {"nodes": []}}}
            if "MekyroProductMediaCreate" in query:
                return {"productCreateMedia": {"media": []}}
            if "MekyroPublications" in query:
                return {"publications": {"nodes": []}}
            return {}

        async def get_location_id(self):
            return "gid://shopify/Location/1"

        async def close(self):
            return None

    gateway = FakeGateway()

    async def synchronize():
        async with client.app.state.database.sessions() as session:
            service = ShopifyProductSyncService(
                session,
                gateway,
                NEWLIFE,
            )
            result = await service.run(operation="catalog", product_ids=[product_id])
            await session.commit()
            variant = await session.scalar(
                select(ProductVariant).where(ProductVariant.product_id == product_id)
            )
            return result, variant

    result, variant = asyncio.run(synchronize())
    assert result["product_count"] == 1
    assert gateway.product_input["productType"] == "Electronics"
    assert gateway.product_input["tags"] == ["Smartphones", "Nested Mobile Phones"]
    assert [option["name"] for option in gateway.product_input["productOptions"]] == [
        "storage",
        "color",
        "version",
    ]
    remote_variant = gateway.product_input["variants"][0]
    assert remote_variant["sku"] == "FOUR-OPTION-001 | sim_slot:Dual"
    assert remote_variant["optionValues"][-1] == {
        "optionName": "version",
        "name": "Global | sim_slot:Dual",
    }
    assert variant.external_ids["shopify_variant_id"].endswith("/four-options")


def test_shopify_outbox_claim_is_atomic_and_expired_lease_is_recoverable(
    client: TestClient,
    newlife_token: str,
):
    ops_token = _login_ops(client)
    config = client.post(
        "/api/v1/internal/shopify-configs",
        headers=auth_header(ops_token),
        json={
            "workspace_id": NEWLIFE,
            "store_url": "https://newlife-claim.myshopify.com",
            "api_key": "claim-client-id",
            "api_secret_key": "claim-client-secret",
        },
    ).json()
    client.patch(
        f"/api/v1/internal/shopify-configs/{config['config_id']}/status",
        headers=auth_header(ops_token),
        json={"is_active": True},
    )
    job = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/shopify/sync-jobs",
        headers=auth_header(newlife_token),
        json={"operation": "catalog", "product_ids": [PRODUCT_ID]},
    ).json()

    async def claim_twice_and_recover():
        async with client.app.state.database.sessions() as first_session:
            first_claim = await claim_shopify_outbox_message(first_session, job["id"])
        async with client.app.state.database.sessions() as second_session:
            duplicate_claim = await claim_shopify_outbox_message(second_session, job["id"])
            message = await second_session.get(OutboxMessage, job["id"])
            message.available_at = datetime.now(UTC) - timedelta(seconds=1)
            await second_session.commit()
        async with client.app.state.database.sessions() as recovery_session:
            recovered_claim = await claim_shopify_outbox_message(recovery_session, job["id"])
            recovered = await recovery_session.get(OutboxMessage, job["id"])
            return first_claim, duplicate_claim, recovered_claim, recovered

    first_claim, duplicate_claim, recovered_claim, message = asyncio.run(
        claim_twice_and_recover()
    )
    assert first_claim is True
    assert duplicate_claim is False
    assert recovered_claim is True
    assert message.status == "processing"
    assert message.attempts == 2


def test_shopify_outbox_worker_records_retryable_failure(
    client: TestClient,
    newlife_token: str,
):
    ops_token = _login_ops(client)
    config = client.post(
        "/api/v1/internal/shopify-configs",
        headers=auth_header(ops_token),
        json={
            "workspace_id": NEWLIFE,
            "store_url": "https://newlife-dev.myshopify.com",
            "api_key": "client-id",
            "api_secret_key": "client-secret",
        },
    ).json()
    client.patch(
        f"/api/v1/internal/shopify-configs/{config['config_id']}/status",
        headers=auth_header(ops_token),
        json={"is_active": True},
    )
    job = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/shopify/sync-jobs",
        headers=auth_header(newlife_token),
        json={"operation": "catalog", "product_ids": [PRODUCT_ID]},
    ).json()

    class FailingGateway:
        async def execute(self, *_args, **_kwargs):
            raise RuntimeError("temporary upstream failure")

        async def get_location_id(self):
            raise AssertionError("not reached")

        async def close(self):
            return None

    async def fail_and_read():
        async with client.app.state.database.sessions() as session:
            with pytest.raises(RuntimeError, match="temporary upstream failure"):
                await process_shopify_outbox_message(
                    session,
                    job["id"],
                    Settings(),
                    gateway_factory=lambda _config, _settings: FailingGateway(),
                )
            return await session.get(OutboxMessage, job["id"])

    message = asyncio.run(fail_and_read())
    assert message.status == "pending"
    assert message.attempts == 1
    assert message.last_error == "temporary upstream failure"
