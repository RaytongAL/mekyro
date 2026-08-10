import argparse
import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import Database
from app.core.models import OutboxMessage
from app.modules.shopify.sync import OutboxClaimUnavailable, process_shopify_outbox_message

logger = logging.getLogger(__name__)


async def process_available(database: Database, *, batch_size: int = 20) -> int:
    settings = get_settings()
    async with database.sessions() as session:
        ids = list(
            await session.scalars(
                select(OutboxMessage.id)
                .where(
                    OutboxMessage.topic == "shopify.sync.requested",
                    OutboxMessage.status.in_(("pending", "processing")),
                    OutboxMessage.available_at <= datetime.now(UTC),
                )
                .order_by(OutboxMessage.created_at)
                .limit(batch_size)
            )
        )
    processed = 0
    for message_id in ids:
        async with database.sessions() as session:
            try:
                await process_shopify_outbox_message(session, message_id, settings)
            except OutboxClaimUnavailable:
                continue
            except Exception:
                logger.exception("Shopify outbox message failed: %s", message_id)
            else:
                processed += 1
    return processed


async def run(*, once: bool, poll_seconds: float, batch_size: int) -> None:
    settings = get_settings()
    database = Database(settings.database_url)
    try:
        while True:
            processed = await process_available(database, batch_size=batch_size)
            if once:
                print(f"Processed {processed} Shopify outbox message(s).")
                return
            if processed == 0:
                await asyncio.sleep(poll_seconds)
    finally:
        await database.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Process Shopify synchronization outbox jobs")
    parser.add_argument("--once", action="store_true", help="Process one available batch and exit")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    parser.add_argument("--batch-size", type=int, default=20)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(
        run(
            once=args.once,
            poll_seconds=max(0.1, args.poll_seconds),
            batch_size=max(1, min(args.batch_size, 100)),
        )
    )
