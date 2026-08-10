import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Protocol

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import Settings
from app.core.models import OutboxMessage, Product, ProductVariant, Workspace
from app.modules.vendure.client import VendureClient


class VendureGateway(Protocol):
    async def execute(self, query: str, variables: dict | None = None, **kwargs) -> dict: ...

    async def close(self) -> None: ...


class OutboxClaimUnavailable(RuntimeError):
    pass


class VendureProductSyncService:
    def __init__(self, session: AsyncSession, gateway: VendureGateway, workspace_id: str):
        self.session = session
        self.gateway = gateway
        self.workspace_id = workspace_id

    async def run(self, *, operation: str, product_ids: list[str]) -> dict:
        products = await self._load_products(product_ids)
        if operation == "delete":
            for product in products:
                await self._disable_product(product)
            return {"operation": operation, "product_count": len(products), "variant_count": 0}
        if operation == "inventory":
            variant_count = 0
            for product in products:
                variant_count += await self._sync_inventory(product)
            return {"operation": operation, "product_count": 0, "variant_count": variant_count}
        variant_count = 0
        for product in products:
            variant_count += await self._sync_product(product)
        return {
            "operation": operation,
            "product_count": len(products),
            "variant_count": variant_count,
        }

    async def _load_products(self, product_ids: list[str]) -> list[Product]:
        filters = [Product.workspace_id == self.workspace_id]
        if product_ids:
            filters.append(Product.id.in_(product_ids))
        items = (
            (
                await self.session.scalars(
                    select(Product)
                    .where(*filters)
                    .options(
                        selectinload(Product.variants).selectinload(ProductVariant.price_tiers),
                        selectinload(Product.variants).selectinload(ProductVariant.images),
                        selectinload(Product.images),
                    )
                    .order_by(Product.created_at)
                )
            )
            .unique()
            .all()
        )
        if product_ids and len(items) != len(set(product_ids)):
            raise ValueError("One or more Vendure products were not found in the Workspace")
        return list(items)

    async def _sync_product(self, product: Product) -> int:
        remote_product_id = str((product.external_ids or {}).get("vendure_product_id") or "")
        if not remote_product_id:
            remote_product_id = await self._find_remote_product(product)
        if remote_product_id:
            await self.gateway.execute(
                """
                mutation MekyroVendureProductUpdate($input: UpdateProductInput!) {
                  updateProduct(input: $input) { id userErrors { field message errorCode } }
                }
                """,
                {"input": {"id": remote_product_id, **_product_input(product)}},
            )
        else:
            data = await self.gateway.execute(
                """
                mutation MekyroVendureProductCreate($input: CreateProductInput!) {
                  createProduct(input: $input) { id userErrors { field message errorCode } }
                }
                """,
                {"input": _product_input(product)},
            )
            remote_product_id = str((data.get("createProduct") or {}).get("id") or "")
            if not remote_product_id:
                raise RuntimeError("Vendure createProduct did not return a product ID")
        product.external_ids = {
            **(product.external_ids or {}),
            "vendure_product_id": remote_product_id,
        }
        option_ids, remote_variants = await self._ensure_options(product, remote_product_id)
        active_variants = [item for item in product.variants if not item.is_deleted]
        created_inputs = []
        created_locals = []
        updated_inputs = []
        for variant in active_variants:
            remote_id = str((variant.external_ids or {}).get("vendure_variant_id") or "")
            if not remote_id:
                remote_id = remote_variants.get(variant.sku_code, "")
            item = _variant_input(variant, option_ids)
            if remote_id:
                updated_inputs.append({"id": remote_id, **item})
                variant.external_ids = {
                    **(variant.external_ids or {}),
                    "vendure_variant_id": remote_id,
                }
            else:
                create_item = {"productId": remote_product_id, **item}
                prices = create_item.pop("prices", [])
                create_item["price"] = int(prices[0]["price"]) if prices else 0
                created_inputs.append(create_item)
                created_locals.append(variant)
        if updated_inputs:
            await self.gateway.execute(
                """
                mutation MekyroVendureVariantsUpdate($input: [UpdateProductVariantInput!]!) {
                  updateProductVariants(input: $input) { id sku userErrors { field message errorCode } }
                }
                """,
                {"input": updated_inputs},
            )
        if created_inputs:
            data = await self.gateway.execute(
                """
                mutation MekyroVendureVariantsCreate($input: [CreateProductVariantInput!]!) {
                  createProductVariants(input: $input) { id sku userErrors { field message errorCode } }
                }
                """,
                {"input": created_inputs},
            )
            created = data.get("createProductVariants") or []
            by_sku = {str(item.get("sku") or ""): str(item.get("id") or "") for item in created}
            for variant in created_locals:
                remote_id = by_sku.get(variant.sku_code, "")
                if remote_id:
                    variant.external_ids = {
                        **(variant.external_ids or {}),
                        "vendure_variant_id": remote_id,
                    }
        return len(active_variants)

    async def _find_remote_product(self, product: Product) -> str:
        data = await self.gateway.execute(
            """
            query MekyroVendureProductFind($mekyroId: String!, $slug: String!) {
              byMekyro: products(options: { take: 1, filter: { mekyroProductId: { eq: $mekyroId } } }) {
                items { id }
              }
              bySlug: products(options: { take: 1, filter: { slug: { eq: $slug } } }) {
                items { id }
              }
            }
            """,
            {"mekyroId": product.id, "slug": f"mekyro-prod-{product.id}"},
        )
        for key in ("byMekyro", "bySlug"):
            items = (data.get(key) or {}).get("items") or []
            if items and items[0].get("id"):
                return str(items[0]["id"])
        return ""

    async def _ensure_options(
        self,
        product: Product,
        remote_product_id: str,
    ) -> tuple[dict[str, str], dict[str, str]]:
        data = await self.gateway.execute(
            """
            query MekyroVendureProductOptions($id: ID!) {
              product(id: $id) {
                optionGroups { id code options { id name } }
                variants { id sku }
              }
            }
            """,
            {"id": remote_product_id},
        )
        remote = data.get("product") or {}
        option_ids = {
            str(option.get("name") or ""): str(option.get("id") or "")
            for group in remote.get("optionGroups") or []
            for option in group.get("options") or []
            if option.get("name") and option.get("id")
        }
        for spec in product.specification_template or []:
            name = str(spec.get("name") or "").strip()
            values = [str(value).strip() for value in spec.get("options") or [] if str(value).strip()]
            if not name or not values or all(value in option_ids for value in values):
                continue
            code = f"mekyro-{product.id}-{len(option_ids)}"
            created = await self.gateway.execute(
                """
                mutation MekyroVendureOptionCreate($input: CreateProductOptionGroupInput!) {
                  createProductOptionGroup(input: $input) {
                    id options { id name } userErrors { field message errorCode }
                  }
                }
                """,
                {
                    "input": {
                        "code": code,
                        "translations": _name_translations(name),
                        "options": [
                            {"code": f"{code}-{index}", "translations": _name_translations(value)}
                            for index, value in enumerate(values)
                        ],
                    }
                },
            )
            group = created.get("createProductOptionGroup") or {}
            group_id = str(group.get("id") or "")
            if group_id:
                await self.gateway.execute(
                    """
                    mutation MekyroVendureOptionAttach($productId: ID!, $optionGroupId: ID!) {
                      addOptionGroupToProduct(productId: $productId, optionGroupId: $optionGroupId) { id }
                    }
                    """,
                    {"productId": remote_product_id, "optionGroupId": group_id},
                )
            for option in group.get("options") or []:
                if option.get("name") and option.get("id"):
                    option_ids[str(option["name"])] = str(option["id"])
        remote_variants = {
            str(item.get("sku") or ""): str(item.get("id") or "")
            for item in remote.get("variants") or []
            if item.get("sku") and item.get("id")
        }
        return option_ids, remote_variants

    async def _sync_inventory(self, product: Product) -> int:
        updates = []
        for variant in product.variants:
            if variant.is_deleted:
                continue
            remote_id = str((variant.external_ids or {}).get("vendure_variant_id") or "")
            if remote_id:
                updates.append({"id": remote_id, "stockOnHand": variant.stock_quantity})
        if updates:
            await self.gateway.execute(
                """
                mutation MekyroVendureInventory($input: [UpdateProductVariantInput!]!) {
                  updateProductVariants(input: $input) { id stockOnHand userErrors { field message errorCode } }
                }
                """,
                {"input": updates},
            )
        return len(updates)

    async def _disable_product(self, product: Product) -> None:
        remote_id = str((product.external_ids or {}).get("vendure_product_id") or "")
        if not remote_id:
            return
        await self.gateway.execute(
            """
            mutation MekyroVendureProductDisable($input: UpdateProductInput!) {
              updateProduct(input: $input) { id userErrors { field message errorCode } }
            }
            """,
            {"input": {"id": remote_id, "enabled": False, "customFields": {"isDeleted": True}}},
        )


def _translations(product: Product) -> list[dict]:
    slug = f"mekyro-prod-{product.id}"
    return [
        {"languageCode": language, "name": product.name, "slug": slug, "description": product.description}
        for language in ("zh", "en")
    ]


def _name_translations(name: str) -> list[dict]:
    return [{"languageCode": language, "name": name} for language in ("zh", "en")]


def _product_input(product: Product) -> dict:
    head_images = [image.file_key for image in product.images if image.image_type == "product"]
    detail_image = next(
        (image.file_key for image in product.images if image.image_type == "product_detail"),
        "",
    )
    return {
        "enabled": product.status == "active" and not product.is_deleted,
        "translations": _translations(product),
        "customFields": {
            "mekyroProductId": product.id,
            "mekyroWorkspaceId": product.workspace_id,
            "specTemplate": json.dumps(product.specification_template or [], ensure_ascii=False),
            "headImages": json.dumps(head_images, ensure_ascii=False),
            "detailImage": detail_image,
            "isDeleted": product.is_deleted,
        },
    }


def _variant_input(variant: ProductVariant, option_ids: dict[str, str]) -> dict:
    tiers = sorted(variant.price_tiers, key=lambda item: item.minimum_quantity)
    price = tiers[0].unit_price if tiers else Decimal("0")
    image = next((item.file_key for item in variant.images if item.image_type == "sku"), "")
    selected_options = [
        option_ids[str(value)]
        for value in (variant.specifications or {}).values()
        if str(value) in option_ids
    ]
    name = " / ".join(str(value) for value in (variant.specifications or {}).values() if value)
    return {
        "sku": variant.sku_code,
        "prices": [{"currencyCode": variant.currency, "price": int(price * 100)}],
        "stockOnHand": variant.stock_quantity,
        "enabled": variant.status == "active" and not variant.is_deleted,
        "optionIds": selected_options,
        "translations": _name_translations(name or variant.sku_code),
        "customFields": {
            "mekyroVariantId": variant.id,
            "mekyroInventoryItemId": variant.id,
            "specs": json.dumps(variant.specifications or {}, ensure_ascii=False),
            "moq": variant.minimum_order_quantity,
            "skuImage": image,
            "isDeleted": variant.is_deleted,
        },
    }


GatewayFactory = Callable[[Workspace, Settings], VendureGateway]


async def claim_vendure_outbox_message(
    session: AsyncSession,
    message_id: str,
    *,
    lease_seconds: int = 300,
) -> bool:
    now = datetime.now(UTC)
    claimed_id = await session.scalar(
        update(OutboxMessage)
        .where(
            OutboxMessage.id == message_id,
            OutboxMessage.topic == "vendure.sync.requested",
            or_(
                and_(OutboxMessage.status == "pending", OutboxMessage.available_at <= now),
                and_(OutboxMessage.status == "processing", OutboxMessage.available_at <= now),
            ),
        )
        .values(
            status="processing",
            attempts=OutboxMessage.attempts + 1,
            last_error="",
            available_at=now + timedelta(seconds=max(30, lease_seconds)),
        )
        .returning(OutboxMessage.id)
        .execution_options(synchronize_session=False)
    )
    await session.commit()
    return claimed_id is not None


async def process_vendure_outbox_message(
    session: AsyncSession,
    message_id: str,
    settings: Settings,
    *,
    gateway_factory: GatewayFactory | None = None,
    max_attempts: int = 5,
) -> OutboxMessage:
    existing = await session.scalar(
        select(OutboxMessage).where(
            OutboxMessage.id == message_id,
            OutboxMessage.topic == "vendure.sync.requested",
        )
    )
    if existing is None:
        raise ValueError("Vendure outbox message was not found")
    if existing.status == "processed":
        return existing
    workspace = await session.scalar(
        select(Workspace).where(
            Workspace.id == existing.workspace_id,
            Workspace.is_active.is_(True),
            Workspace.site_type.in_(("vendure", "independent")),
        )
    )
    if workspace is None or not workspace.vendure_channels_token:
        raise ValueError("Active Vendure Workspace configuration was not found")
    if not await claim_vendure_outbox_message(session, message_id):
        raise OutboxClaimUnavailable("Vendure outbox message is already processing")
    await session.refresh(existing)
    gateway = (
        gateway_factory(workspace, settings)
        if gateway_factory is not None
        else VendureClient(workspace, settings)
    )
    try:
        result = await VendureProductSyncService(
            session,
            gateway,
            existing.workspace_id,
        ).run(
            operation=str(existing.payload.get("operation") or "catalog"),
            product_ids=[str(value) for value in existing.payload.get("product_ids") or []],
        )
        message = await session.get(OutboxMessage, message_id)
        if message is None:
            raise RuntimeError("Outbox message disappeared during processing")
        message.status = "processed"
        message.processed_at = datetime.now(UTC)
        message.payload = {**message.payload, "result": result}
        await session.commit()
        return message
    except Exception as exc:
        await session.rollback()
        message = await session.get(OutboxMessage, message_id)
        if message is None:
            raise
        message.status = "failed" if message.attempts >= max_attempts else "pending"
        message.last_error = str(exc)[:2000]
        message.available_at = datetime.now(UTC) + timedelta(
            seconds=min(3600, 2 ** max(0, message.attempts - 1))
        )
        await session.commit()
        raise
    finally:
        await gateway.close()
