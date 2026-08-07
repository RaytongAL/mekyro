from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import OutboxMessage, ShopifyConfig, new_id


async def enqueue_shopify_sync_if_active(
    session: AsyncSession,
    *,
    workspace_id: str,
    operation: str,
    product_ids: list[str],
    extra_payload: dict | None = None,
) -> OutboxMessage | None:
    with session.no_autoflush:
        config = await session.scalar(
            select(ShopifyConfig).where(
                ShopifyConfig.workspace_id == workspace_id,
                ShopifyConfig.is_active.is_(True),
            )
        )
    if config is None or not config.is_ready:
        return None
    message_id = new_id()
    message = OutboxMessage(
        id=message_id,
        workspace_id=workspace_id,
        topic="shopify.sync.requested",
        aggregate_type="workspace",
        aggregate_id=workspace_id,
        deduplication_key=f"shopify:auto:{message_id}",
        payload={
            "operation": operation,
            "product_ids": list(dict.fromkeys(product_ids)),
            **(extra_payload or {}),
        },
    )
    session.add(message)
    return message
