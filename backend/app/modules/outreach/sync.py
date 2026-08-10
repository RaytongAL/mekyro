from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Protocol

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import Lead, OutboxMessage, Workspace
from app.modules.outreach.client import EmailOutreachClient


class OutreachGateway(Protocol):
    async def trigger(
        self,
        *,
        lead_id: str,
        workspace_id: str,
        allow_repeat: bool = True,
    ) -> dict: ...

    async def close(self) -> None: ...


class OutboxClaimUnavailable(RuntimeError):
    pass


GatewayFactory = Callable[[Settings], OutreachGateway]


async def claim_outreach_message(
    session: AsyncSession,
    message_id: str,
    *,
    lease_seconds: int = 120,
) -> bool:
    now = datetime.now(UTC)
    claimed_id = await session.scalar(
        update(OutboxMessage)
        .where(
            OutboxMessage.id == message_id,
            OutboxMessage.topic == "email.outreach.requested",
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


async def process_outreach_message(
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
            OutboxMessage.topic == "email.outreach.requested",
        )
    )
    if existing is None:
        raise ValueError("Email outreach outbox message was not found")
    if existing.status == "processed":
        return existing
    workspace = await session.scalar(
        select(Workspace).where(
            Workspace.id == existing.workspace_id,
            Workspace.is_active.is_(True),
            Workspace.email_outreach_enabled.is_(True),
        )
    )
    lead_id = str(existing.payload.get("lead_id") or existing.aggregate_id)
    lead = await session.scalar(
        select(Lead).where(
            Lead.id == lead_id,
            Lead.workspace_id == existing.workspace_id,
        )
    )
    if workspace is None or lead is None:
        raise ValueError("Workspace-scoped lead for email outreach was not found")
    if not await claim_outreach_message(session, message_id):
        raise OutboxClaimUnavailable("Email outreach message is already processing")
    await session.refresh(existing)
    gateway = gateway_factory(settings) if gateway_factory else EmailOutreachClient(settings)
    try:
        result = await gateway.trigger(
            lead_id=lead.id,
            workspace_id=workspace.id,
            allow_repeat=bool(existing.payload.get("allow_repeat", True)),
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
