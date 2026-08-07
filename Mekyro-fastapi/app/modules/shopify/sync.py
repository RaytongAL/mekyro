import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Protocol

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, with_loader_criteria

from app.core.config import Settings
from app.core.models import (
    Category,
    OutboxMessage,
    Product,
    ProductVariant,
    ShopifyConfig,
)
from app.modules.shopify.client import ShopifyClient

logger = logging.getLogger(__name__)


class ShopifyGateway(Protocol):
    async def execute(self, query: str, variables: dict | None = None, **kwargs) -> dict: ...

    async def get_location_id(self) -> str: ...

    async def close(self) -> None: ...


class OutboxClaimUnavailable(RuntimeError):
    pass


class ShopifyProductSyncService:
    def __init__(self, session: AsyncSession, gateway: ShopifyGateway, workspace_id: str):
        self.session = session
        self.gateway = gateway
        self.workspace_id = workspace_id

    async def run(
        self,
        *,
        operation: str,
        product_ids: list[str],
        remote_product_ids: list[str] | None = None,
    ) -> dict:
        if operation == "delete":
            deleted = await self._delete_products(remote_product_ids or [])
            return {
                "operation": operation,
                "product_count": deleted,
                "inventory_variant_count": 0,
                "media_count": 0,
            }
        products = await self._load_products(product_ids)
        synced_products = 0
        synced_inventory = 0
        synced_media = 0
        if operation in {"catalog", "full"}:
            for product in products:
                synced_media += await self._sync_product(product)
                synced_products += 1
        if operation in {"catalog", "inventory", "full"}:
            synced_inventory = await self._sync_inventory(products)
        return {
            "operation": operation,
            "product_count": synced_products,
            "inventory_variant_count": synced_inventory,
            "media_count": synced_media,
        }

    async def _delete_products(self, remote_product_ids: list[str]) -> int:
        deleted = 0
        for remote_product_id in remote_product_ids:
            if not remote_product_id:
                continue
            await self.gateway.execute(
                """
                mutation MekyroProductDelete($input: ProductDeleteInput!) {
                  productDelete(input: $input) {
                    deletedProductId
                    userErrors { field message code }
                  }
                }
                """,
                {"input": {"id": remote_product_id}},
            )
            deleted += 1
        return deleted

    async def _load_products(self, product_ids: list[str]) -> list[Product]:
        filters = [
            Product.workspace_id == self.workspace_id,
            Product.is_deleted.is_(False),
        ]
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
                        with_loader_criteria(
                            ProductVariant,
                            ProductVariant.is_deleted.is_(False),
                            include_aliases=True,
                        ),
                    )
                    .order_by(Product.created_at)
                )
            )
            .unique()
            .all()
        )
        return list(items)

    async def _sync_product(self, product: Product) -> int:
        existing_product_id = str((product.external_ids or {}).get("shopify_product_id") or "")
        identifier = {"id": existing_product_id} if existing_product_id else None
        option_names, extra_option_names = _product_option_names(product)
        product_input = {
            "title": product.name,
            "descriptionHtml": _description_html(product),
            "vendor": "mekyro",
            "status": "ACTIVE" if product.status == "active" else "DRAFT",
            "productOptions": _product_options(product, option_names),
            "variants": [
                _variant_input(variant, option_names, extra_option_names)
                for variant in product.variants
            ],
        }
        product_type, tags = await self._category_metadata(product.category_id)
        if product_type:
            product_input["productType"] = product_type
        if tags:
            product_input["tags"] = tags
        variables = {
            "identifier": identifier,
            "input": product_input,
            "synchronous": True,
        }
        data = await self.gateway.execute(
            """
            mutation MekyroProductSet(
              $identifier: ProductSetIdentifiers,
              $input: ProductSetInput!,
              $synchronous: Boolean!
            ) {
              productSet(identifier: $identifier, input: $input, synchronous: $synchronous) {
                product {
                  id
                  variants(first: 100) {
                    nodes { id sku inventoryItem { id } }
                  }
                }
                userErrors { field message code }
              }
            }
            """,
            variables,
        )
        remote_product = (data.get("productSet") or {}).get("product") or {}
        remote_product_id = remote_product.get("id")
        if not remote_product_id:
            raise RuntimeError("Shopify productSet did not return a product ID")
        product.external_ids = {
            **(product.external_ids or {}),
            "shopify_product_id": str(remote_product_id),
        }
        local_variants = {
            _shopify_sku(variant, extra_option_names): variant for variant in product.variants
        }
        nodes = (remote_product.get("variants") or {}).get("nodes") or []
        for node in nodes:
            local = local_variants.get(str(node.get("sku") or ""))
            if local is None:
                continue
            inventory_item_id = (node.get("inventoryItem") or {}).get("id")
            local.external_ids = {
                **(local.external_ids or {}),
                "shopify_variant_id": str(node.get("id") or ""),
                "shopify_inventory_item_id": str(inventory_item_id or ""),
            }
        media_count = await self._replace_product_media(product, str(remote_product_id))
        if not existing_product_id:
            await self._publish_to_online_store(str(remote_product_id))
        return media_count

    async def _publish_to_online_store(self, remote_product_id: str) -> None:
        try:
            data = await self.gateway.execute(
                """
                query MekyroPublications {
                  publications(first: 100) { nodes { id name } }
                }
                """
            )
            publication = next(
                (
                    item
                    for item in (data.get("publications") or {}).get("nodes") or []
                    if item.get("name") == "Online Store"
                ),
                None,
            )
            if publication is None:
                return
            await self.gateway.execute(
                """
                mutation MekyroPublishProduct($id: ID!, $input: [PublicationInput!]!) {
                  publishablePublish(id: $id, input: $input) {
                    publishable { publishedOnCurrentPublication }
                    userErrors { field message code }
                  }
                }
                """,
                {
                    "id": remote_product_id,
                    "input": [{"publicationId": str(publication["id"])}],
                },
            )
        except Exception:
            logger.warning(
                "Shopify product was synchronized but could not be published: %s",
                remote_product_id,
                exc_info=True,
            )

    async def _category_metadata(self, category_id: str | None) -> tuple[str, list[str]]:
        if not category_id:
            return "", []
        names: list[str] = []
        seen: set[str] = set()
        current_id = category_id
        while current_id and current_id not in seen:
            seen.add(current_id)
            category = await self.session.get(Category, current_id)
            if category is None or category.workspace_id != self.workspace_id:
                break
            names.append(category.name)
            current_id = category.parent_id
        if not names:
            return "", []
        return names[-1], names[:-1]

    async def _replace_product_media(self, product: Product, remote_product_id: str) -> int:
        existing = await self.gateway.execute(
            """
            query MekyroProductMedia($id: ID!) {
              product(id: $id) { media(first: 250) { nodes { id } } }
            }
            """,
            {"id": remote_product_id},
        )
        media_ids = [
            str(node.get("id"))
            for node in (((existing.get("product") or {}).get("media") or {}).get("nodes") or [])
            if node.get("id")
        ]
        if media_ids:
            await self.gateway.execute(
                """
                mutation MekyroProductMediaDelete($productId: ID!, $mediaIds: [ID!]!) {
                  productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
                    deletedMediaIds
                    userErrors { field message code }
                  }
                }
                """,
                {"productId": remote_product_id, "mediaIds": media_ids},
            )

        media_inputs: list[dict] = []
        variant_by_alt: dict[str, ProductVariant] = {}
        for image in product.images:
            if image.image_type != "product" or not _remote_media_url(image.file_key):
                continue
            media_inputs.append(
                {
                    "mediaContentType": "IMAGE",
                    "originalSource": image.file_key,
                    "alt": f"mekyro:product:{image.id}",
                }
            )
        for variant in product.variants:
            image = next(
                (
                    item
                    for item in variant.images
                    if item.image_type == "sku" and _remote_media_url(item.file_key)
                ),
                None,
            )
            if image is None:
                continue
            alt = f"mekyro:variant:{variant.id}"
            variant_by_alt[alt] = variant
            media_inputs.append(
                {
                    "mediaContentType": "IMAGE",
                    "originalSource": image.file_key,
                    "alt": alt,
                }
            )
        if not media_inputs:
            media_inputs.append(
                {
                    "mediaContentType": "IMAGE",
                    "originalSource": "https://placehold.co/600x600/EEE/999?text=Product+Image",
                    "alt": "mekyro:placeholder",
                }
            )
        created = await self.gateway.execute(
            """
            mutation MekyroProductMediaCreate($productId: ID!, $media: [CreateMediaInput!]!) {
              productCreateMedia(productId: $productId, media: $media) {
                media { id alt }
                mediaUserErrors { field message code }
              }
            }
            """,
            {"productId": remote_product_id, "media": media_inputs},
        )
        media_nodes = (created.get("productCreateMedia") or {}).get("media") or []
        variant_updates = []
        for node in media_nodes:
            variant = variant_by_alt.get(str(node.get("alt") or ""))
            variant_id = str((variant.external_ids or {}).get("shopify_variant_id") or "") if variant else ""
            if variant_id and node.get("id"):
                variant_updates.append({"id": variant_id, "mediaId": str(node["id"])})
        if variant_updates:
            await self.gateway.execute(
                """
                mutation MekyroVariantMediaAssign(
                  $productId: ID!, $variants: [ProductVariantsBulkInput!]!
                ) {
                  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                    productVariants { id }
                    userErrors { field message code }
                  }
                }
                """,
                {"productId": remote_product_id, "variants": variant_updates},
            )
        return len(media_inputs)

    async def _sync_inventory(self, products: list[Product]) -> int:
        quantities = []
        for product in products:
            for variant in product.variants:
                inventory_item_id = str(
                    (variant.external_ids or {}).get("shopify_inventory_item_id") or ""
                )
                if inventory_item_id:
                    quantities.append(
                        {
                            "inventoryItemId": inventory_item_id,
                            "quantity": variant.stock_quantity,
                        }
                    )
        if not quantities:
            return 0
        location_id = await self.gateway.get_location_id()
        for item in quantities:
            item["locationId"] = location_id
        await self.gateway.execute(
            """
            mutation MekyroInventorySet($input: InventorySetQuantitiesInput!) {
              inventorySetQuantities(input: $input) {
                inventoryAdjustmentGroup { createdAt }
                userErrors { field message code }
              }
            }
            """,
            {
                "input": {
                    "name": "available",
                    "reason": "correction",
                    "ignoreCompareQuantity": True,
                    "quantities": quantities,
                }
            },
        )
        return len(quantities)


def _product_option_names(product: Product) -> tuple[list[str], list[str]]:
    keys = [
        str(item.get("name") or "")
        for item in product.specification_template
        if isinstance(item, dict) and item.get("name")
    ]
    for variant in product.variants:
        for key in variant.specifications:
            if key not in keys:
                keys.append(key)
    priority = ("storage", "color", "version")
    ordered = sorted(
        keys,
        key=lambda key: next(
            (index for index, value in enumerate(priority) if value in key.lower()),
            len(priority),
        ),
    )
    return ordered[:3], ordered[3:]


def _product_options(product: Product, keys: list[str]) -> list[dict]:
    return [
        {
            "name": key,
            "position": index + 1,
            "values": [
                {"name": value}
                for value in dict.fromkeys(
                    str(variant.specifications.get(key) or "Default")
                    for variant in product.variants
                )
            ],
        }
        for index, key in enumerate(keys)
    ]


def _variant_input(
    variant: ProductVariant,
    option_names: list[str],
    extra_option_names: list[str],
) -> dict:
    tiers = sorted(variant.price_tiers, key=lambda item: item.minimum_quantity)
    price = tiers[0].unit_price if tiers else Decimal("0")
    item = {
        "sku": _shopify_sku(variant, extra_option_names),
        "price": f"{price:.2f}",
        "optionValues": [
            {
                "optionName": key,
                "name": str(variant.specifications.get(key) or "Default"),
            }
            for key in option_names
        ],
    }
    extra_values = [
        f"{key}:{variant.specifications[key]}"
        for key in extra_option_names
        if key in {"version_desc", "sim_slot"} and variant.specifications.get(key)
    ]
    if extra_values:
        version_option = next(
            (
                value
                for value in item["optionValues"]
                if "version" in value["optionName"].lower()
            ),
            None,
        )
        if version_option is not None:
            version_option["name"] = f"{version_option['name']} | {' | '.join(extra_values)}"
    existing_id = str((variant.external_ids or {}).get("shopify_variant_id") or "")
    if existing_id:
        item["id"] = existing_id
    return item


def _shopify_sku(variant: ProductVariant, extra_option_names: list[str]) -> str:
    suffix = [
        f"{key}:{variant.specifications[key]}"
        for key in extra_option_names
        if variant.specifications.get(key)
    ]
    return f"{variant.sku_code} | {' | '.join(suffix)}" if suffix else variant.sku_code


def _description_html(product: Product) -> str:
    detail_images = [
        image.file_key
        for image in product.images
        if image.image_type == "product_detail" and _remote_media_url(image.file_key)
    ]
    return product.description + "".join(
        f'<img src="{url}" alt="Product detail" />' for url in detail_images
    )


def _remote_media_url(value: str) -> bool:
    return value.startswith(("http://", "https://"))


GatewayFactory = Callable[[ShopifyConfig, Settings], ShopifyGateway]


async def claim_shopify_outbox_message(
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
            OutboxMessage.topic == "shopify.sync.requested",
            or_(
                and_(
                    OutboxMessage.status == "pending",
                    OutboxMessage.available_at <= now,
                ),
                and_(
                    OutboxMessage.status == "processing",
                    OutboxMessage.available_at <= now,
                ),
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


async def process_shopify_outbox_message(
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
            OutboxMessage.topic == "shopify.sync.requested",
        )
    )
    if existing is None:
        raise ValueError("Shopify outbox message was not found")
    if existing.status == "processed":
        return existing
    config = await session.scalar(
        select(ShopifyConfig).where(
            ShopifyConfig.workspace_id == existing.workspace_id,
            ShopifyConfig.is_active.is_(True),
        )
    )
    if config is None or not config.is_ready:
        raise ValueError("Active Shopify configuration was not found")
    if not await claim_shopify_outbox_message(session, message_id):
        raise OutboxClaimUnavailable("Shopify outbox message is already processing")
    await session.refresh(existing)
    message = existing
    gateway = (
        gateway_factory(config, settings)
        if gateway_factory is not None
        else ShopifyClient(config, settings)
    )
    try:
        service = ShopifyProductSyncService(session, gateway, message.workspace_id)
        result = await service.run(
            operation=str(message.payload.get("operation") or "catalog"),
            product_ids=[str(value) for value in message.payload.get("product_ids") or []],
            remote_product_ids=[
                str(value) for value in message.payload.get("remote_product_ids") or []
            ],
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
