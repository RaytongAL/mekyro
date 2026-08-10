from fastapi.testclient import TestClient

from app.scripts.seed_fake_db import IDS
from tests.conftest import auth_header


def _create_category(
    client: TestClient,
    token: str,
    *,
    name: str,
    parent_id: str | None = None,
) -> dict:
    response = client.post(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/categories",
        headers=auth_header(token),
        json={"name": name, "parent_id": parent_id},
    )
    assert response.status_code == 201
    return response.json()


def _create_product(client: TestClient, token: str, *, suffix: str, category_id: str) -> dict:
    response = client.post(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/products",
        headers=auth_header(token),
        json={
            "category_id": category_id,
            "name": f"Test Product {suffix}",
            "description": "Catalog write acceptance product.",
            "specification_template": [{"name": "Color", "options": ["Black", "White"]}],
            "variants": [
                {
                    "sku_code": f"TEST-{suffix}-BLACK",
                    "specifications": {"Color": "Black"},
                    "minimum_order_quantity": 5,
                    "currency": "USD",
                    "stock_quantity": 12,
                    "price_tiers": [
                        {"minimum_quantity": 5, "unit_price": "19.90"},
                        {"minimum_quantity": 20, "unit_price": "17.50"},
                    ],
                },
                {
                    "sku_code": f"TEST-{suffix}-WHITE",
                    "specifications": {"Color": "White"},
                    "minimum_order_quantity": 5,
                    "currency": "USD",
                    "stock_quantity": 0,
                },
            ],
        },
    )
    assert response.status_code == 201
    return response.json()


def test_category_crud_enforces_hierarchy_and_tenant_scope(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    root = _create_category(client, newlife_token, name="Test Root")
    child = _create_category(client, newlife_token, name="Test Child", parent_id=root["id"])

    updated = client.patch(
        f"{base}/categories/{child['id']}",
        headers=headers,
        json={"name": "Renamed Child", "sort_order": 9},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed Child"
    assert updated.json()["sort_order"] == 9

    cycle = client.patch(
        f"{base}/categories/{root['id']}",
        headers=headers,
        json={"parent_id": child["id"]},
    )
    assert cycle.status_code == 409

    other_root = _create_category(client, newlife_token, name="Other Test Root")
    duplicate_root = client.patch(
        f"{base}/categories/{other_root['id']}",
        headers=headers,
        json={"name": root["name"]},
    )
    assert duplicate_root.status_code == 409

    foreign_parent = client.post(
        f"{base}/categories",
        headers=headers,
        json={"name": "Invalid Foreign Child", "parent_id": IDS["category_home"]},
    )
    assert foreign_parent.status_code == 404

    categories = client.get(f"{base}/categories", headers=headers)
    assert categories.status_code == 200
    assert {root["id"], child["id"]}.issubset({item["id"] for item in categories.json()})
    detail = client.get(f"{base}/categories/{child['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["parent_id"] == root["id"]


def test_category_depth_and_delete_subtree_behavior(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    root = _create_category(client, newlife_token, name="Depth 1")
    parent = root
    for level in range(2, 6):
        parent = _create_category(
            client,
            newlife_token,
            name=f"Depth {level}",
            parent_id=parent["id"],
        )
    too_deep = client.post(
        f"{base}/categories",
        headers=headers,
        json={"name": "Depth 6", "parent_id": parent["id"]},
    )
    assert too_deep.status_code == 409

    product = _create_product(
        client,
        newlife_token,
        suffix="CATEGORY-DELETE",
        category_id=parent["id"],
    )
    deleted = client.delete(f"{base}/categories/{root['id']}", headers=headers)
    assert deleted.status_code == 204
    product_after = client.get(f"{base}/products/{product['id']}", headers=headers)
    assert product_after.status_code == 200
    assert product_after.json()["category_id"] is None
    category_ids = {item["id"] for item in client.get(f"{base}/categories", headers=headers).json()}
    assert root["id"] not in category_ids
    assert parent["id"] not in category_ids


def test_product_and_variant_write_workflow_is_atomic_and_audited(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    category = _create_category(client, newlife_token, name="Workflow Category")
    product = _create_product(
        client,
        newlife_token,
        suffix="WORKFLOW",
        category_id=category["id"],
    )
    assert len(product["variants"]) == 2
    black = next(item for item in product["variants"] if item["sku_code"].endswith("BLACK"))
    assert black["stock_quantity"] == 12
    assert [item["minimum_quantity"] for item in black["price_tiers"]] == [5, 20]

    standalone_variant = client.post(
        f"{base}/products/{product['id']}/variants",
        headers=headers,
        json={
            "sku_code": "TEST-WORKFLOW-BLUE",
            "specifications": {"Color": "Blue"},
            "minimum_order_quantity": 3,
            "stock_quantity": 7,
            "price_tiers": [{"minimum_quantity": 3, "unit_price": "21.00"}],
        },
    )
    assert standalone_variant.status_code == 201, standalone_variant.text
    assert standalone_variant.json()["product_id"] == product["id"]
    assert standalone_variant.json()["price_tiers"][0]["unit_price"] == "21.00"

    product_update = client.patch(
        f"{base}/products/{product['id']}",
        headers=headers,
        json={"name": "Updated Workflow Product", "category_id": None},
    )
    assert product_update.status_code == 200
    assert product_update.json()["name"] == "Updated Workflow Product"
    assert product_update.json()["category_id"] is None

    variant_update = client.patch(
        f"{base}/variants/{black['id']}",
        headers=headers,
        json={
            "minimum_order_quantity": 10,
            "stock_quantity": 22,
            "status": "inactive",
            "product_name": "SKU Combined Workflow Product",
            "product_category_id": category["id"],
        },
    )
    assert variant_update.status_code == 200
    assert variant_update.json()["minimum_order_quantity"] == 10
    assert variant_update.json()["stock_quantity"] == 22
    assert variant_update.json()["status"] == "inactive"
    combined_product = client.get(
        f"{base}/products/{product['id']}", headers=headers
    ).json()
    assert combined_product["name"] == "SKU Combined Workflow Product"
    assert combined_product["category_id"] == category["id"]

    tiers = client.put(
        f"{base}/variants/{black['id']}/price-tiers",
        headers=headers,
        json=[
            {"minimum_quantity": 10, "unit_price": "18.00"},
            {"minimum_quantity": 100, "unit_price": "15.25"},
        ],
    )
    assert tiers.status_code == 200
    assert tiers.json() == [
        {"minimum_quantity": 10, "unit_price": "18.00"},
        {"minimum_quantity": 100, "unit_price": "15.25"},
    ]

    duplicate = client.post(
        f"{base}/products",
        headers=headers,
        json={
            "name": "Must Roll Back",
            "images": ["https://img.example.com/must-rollback.jpg"],
            "detail_image": "https://img.example.com/must-rollback-detail.jpg",
            "variants": [
                {
                    "sku_code": black["sku_code"],
                    "image": "https://img.example.com/must-rollback-sku.jpg",
                }
            ],
        },
    )
    assert duplicate.status_code == 409
    search = client.get(f"{base}/products?search=Must%20Roll%20Back", headers=headers)
    assert search.status_code == 200
    assert search.json()["total"] == 0

    audit = client.get(f"{base}/audit-logs", headers=headers)
    actions = {item["action"] for item in audit.json()}
    assert {
        "catalog.product_created",
        "catalog.product_updated",
        "catalog.variant_updated",
        "catalog.price_tiers_replaced",
    }.issubset(actions)


def test_deactivating_last_variant_deactivates_product(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    product = _create_product(
        client,
        newlife_token,
        suffix="AUTO-INACTIVE",
        category_id=IDS["category_phones"],
    )
    first_variant_id = product["variants"][0]["id"]
    second_variant_id = product["variants"][1]["id"]
    updated = client.patch(
        f"{base}/variants/{first_variant_id}",
        headers=headers,
        json={"status": "inactive"},
    )
    assert updated.status_code == 200
    detail = client.get(f"{base}/products/{product['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["status"] == "active"

    updated = client.patch(
        f"{base}/variants/{second_variant_id}",
        headers=headers,
        json={"status": "inactive"},
    )
    assert updated.status_code == 200
    detail = client.get(f"{base}/products/{product['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["status"] == "inactive"


def test_product_create_atomically_persists_nested_gallery_detail_and_sku_images(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    created = client.post(
        f"{base}/products",
        headers=headers,
        json={
            "name": "Composite Media Product",
            "images": [
                "https://img.example.com/composite-1.jpg",
                "https://img.example.com/composite-2.jpg",
            ],
            "detail_image": "/media/composite-detail.jpg",
            "variants": [
                {
                    "sku_code": "COMPOSITE-MEDIA-01",
                    "image": "https://img.example.com/composite-sku.jpg",
                    "stock_quantity": 8,
                    "price_tiers": [
                        {"minimum_quantity": 2, "unit_price": "0.00"},
                        {"minimum_quantity": 10, "unit_price": "10.00"},
                    ],
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    product = created.json()
    assert [(item["image_type"], item["url"]) for item in product["images"]] == [
        ("product", "https://img.example.com/composite-1.jpg"),
        ("product", "https://img.example.com/composite-2.jpg"),
        ("product_detail", "/media/composite-detail.jpg"),
    ]
    variant = product["variants"][0]
    assert [(item["image_type"], item["url"]) for item in variant["images"]] == [
        ("sku", "https://img.example.com/composite-sku.jpg")
    ]
    assert [item["minimum_quantity"] for item in variant["price_tiers"]] == [2, 10]
    assert variant["price_tiers"][0]["unit_price"] == "0.00"

    detail = client.get(f"{base}/products/{product['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["images"] == product["images"]
    assert detail.json()["variants"][0]["images"] == variant["images"]


def test_product_and_variant_recycle_bin_lifecycle(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    category = _create_category(client, newlife_token, name="Lifecycle Category")
    product = _create_product(
        client,
        newlife_token,
        suffix="LIFECYCLE",
        category_id=category["id"],
    )
    variant = product["variants"][0]

    delete_variant = client.delete(f"{base}/variants/{variant['id']}", headers=headers)
    assert delete_variant.status_code == 204
    assert client.get(f"{base}/variants/{variant['id']}", headers=headers).status_code == 404
    trash = client.get(f"{base}/variants/trash", headers=headers)
    assert variant["id"] in {item["id"] for item in trash.json()}
    restored_variant = client.post(f"{base}/variants/{variant['id']}/restore", headers=headers)
    assert restored_variant.status_code == 200

    delete_product = client.delete(f"{base}/products/{product['id']}", headers=headers)
    assert delete_product.status_code == 204
    assert client.get(f"{base}/products/{product['id']}", headers=headers).status_code == 404
    product_trash = client.get(f"{base}/products/trash", headers=headers)
    assert product["id"] in {item["id"] for item in product_trash.json()}

    child_restore = client.post(f"{base}/variants/{variant['id']}/restore", headers=headers)
    assert child_restore.status_code == 409
    restored_product = client.post(f"{base}/products/{product['id']}/restore", headers=headers)
    assert restored_product.status_code == 200
    assert restored_product.json()["is_deleted"] is False
    assert all(item["is_deleted"] is False for item in restored_product.json()["variants"])


def test_catalog_resource_ids_cannot_escape_workspace(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    assert client.get(f"{base}/products/{IDS['product_lamp']}", headers=headers).status_code == 404
    assert client.get(f"{base}/variants/{IDS['variant_lamp']}", headers=headers).status_code == 404
    assert (
        client.patch(
            f"{base}/categories/{IDS['category_home']}",
            headers=headers,
            json={"name": "Must Not Change"},
        ).status_code
        == 404
    )


def test_specification_options_are_aggregated_per_workspace(
    client: TestClient,
    newlife_token: str,
):
    response = client.get(
        f"/api/v1/workspaces/{IDS['workspace_newlife']}/specification-options",
        headers=auth_header(newlife_token),
    )
    assert response.status_code == 200
    assert response.json()["Grade"] == ["A", "B"]
    assert response.json()["Storage"] == ["128GB"]


def test_product_and_variant_permanent_delete_requires_trash(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    category = _create_category(client, newlife_token, name="Permanent Delete Category")
    product = _create_product(
        client,
        newlife_token,
        suffix="PERMANENT",
        category_id=category["id"],
    )
    first_variant = product["variants"][0]
    second_variant = product["variants"][1]

    active_delete = client.delete(
        f"{base}/variants/{first_variant['id']}/permanent",
        headers=headers,
    )
    assert active_delete.status_code == 409
    assert (
        client.delete(f"{base}/variants/{first_variant['id']}", headers=headers).status_code == 204
    )
    assert (
        client.delete(
            f"{base}/variants/{first_variant['id']}/permanent",
            headers=headers,
        ).status_code
        == 204
    )
    assert first_variant["id"] not in {
        item["id"] for item in client.get(f"{base}/variants/trash", headers=headers).json()
    }

    assert client.delete(f"{base}/products/{product['id']}", headers=headers).status_code == 204
    assert (
        client.delete(
            f"{base}/products/{product['id']}/permanent",
            headers=headers,
        ).status_code
        == 204
    )
    assert product["id"] not in {
        item["id"] for item in client.get(f"{base}/products/trash", headers=headers).json()
    }
    assert client.get(f"{base}/variants/{second_variant['id']}", headers=headers).status_code == 404


def test_order_items_protect_variant_from_permanent_delete(
    client: TestClient,
    newlife_token: str,
):
    headers = auth_header(newlife_token)
    base = f"/api/v1/workspaces/{IDS['workspace_newlife']}"
    assert (
        client.delete(f"{base}/variants/{IDS['variant_iphone_a']}", headers=headers).status_code
        == 204
    )
    protected = client.delete(
        f"{base}/variants/{IDS['variant_iphone_a']}/permanent",
        headers=headers,
    )
    assert protected.status_code == 409
    assert "order items" in protected.json()["detail"]
