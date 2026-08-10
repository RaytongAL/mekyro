from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import OutboxMessage
from app.modules.shopify.outbox import enqueue_shopify_sync_if_active
from app.modules.vendure.outbox import enqueue_vendure_sync_if_configured


async def enqueue_catalog_sync_if_configured(
    session: AsyncSession,
    *,
    workspace_id: str,
    operation: str,
    product_ids: list[str],
    extra_payload: dict | None = None,
) -> list[OutboxMessage]:
    messages = []
    shopify = await enqueue_shopify_sync_if_active(
        session,
        workspace_id=workspace_id,
        operation=operation,
        product_ids=product_ids,
        extra_payload=extra_payload,
    )
    if shopify is not None:
        messages.append(shopify)
    vendure = await enqueue_vendure_sync_if_configured(
        session,
        workspace_id=workspace_id,
        operation=operation,
        product_ids=product_ids,
        extra_payload=extra_payload,
    )
    if vendure is not None:
        messages.append(vendure)
    return messages
