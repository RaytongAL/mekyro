from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import AuditLog


def record_audit(
    session: AsyncSession,
    *,
    workspace_id: str | None,
    actor_user_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str,
    payload: dict | None = None,
) -> AuditLog:
    item = AuditLog(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload or {},
    )
    session.add(item)
    return item
