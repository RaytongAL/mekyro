from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import OutboxMessage, Workspace, new_id


async def enqueue_vendure_sync_if_configured(
    session: AsyncSession,
    *,
    workspace_id: str,
    operation: str,
    product_ids: list[str],
    extra_payload: dict | None = None,
) -> OutboxMessage | None:
    with session.no_autoflush:
        workspace = await session.scalar(
            select(Workspace).where(
                Workspace.id == workspace_id,
                Workspace.is_active.is_(True),
                Workspace.site_type.in_(("vendure", "independent")),
            )
        )
    if workspace is None or not workspace.vendure_channels_token:
        return None
    message_id = new_id()
    message = OutboxMessage(
        id=message_id,
        workspace_id=workspace_id,
        topic="vendure.sync.requested",
        aggregate_type="workspace",
        aggregate_id=workspace_id,
        deduplication_key=f"vendure:auto:{message_id}",
        payload={
            "operation": operation,
            "product_ids": list(dict.fromkeys(product_ids)),
            **(extra_payload or {}),
        },
    )
    session.add(message)
    return message
