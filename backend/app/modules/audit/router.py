from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.core.dependencies import PlatformAdmin, SessionDep, WorkspaceDep
from app.core.models import AuditLog

router = APIRouter(prefix="/workspaces/{workspace_id}/audit-logs", tags=["audit"])
platform_router = APIRouter(prefix="/audit-logs", tags=["audit"])


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str | None
    actor_user_id: str | None
    action: str
    entity_type: str
    entity_id: str
    payload: dict
    created_at: datetime


@router.get("", response_model=list[AuditLogResponse])
async def list_audit_logs(
    context: WorkspaceDep,
    session: SessionDep,
    action: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[AuditLog]:
    filters = [AuditLog.workspace_id == context.workspace.id]
    if action:
        filters.append(AuditLog.action == action)
    items = (
        await session.scalars(
            select(AuditLog).where(*filters).order_by(AuditLog.created_at.desc()).limit(limit)
        )
    ).all()
    return list(items)


@platform_router.get("", response_model=list[AuditLogResponse])
async def list_platform_audit_logs(
    admin: PlatformAdmin,
    session: SessionDep,
    action: str | None = None,
    platform_only: bool = False,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[AuditLog]:
    del admin
    filters = []
    if action:
        filters.append(AuditLog.action == action)
    if platform_only:
        filters.append(AuditLog.workspace_id.is_(None))
    items = (
        await session.scalars(
            select(AuditLog).where(*filters).order_by(AuditLog.created_at.desc()).limit(limit)
        )
    ).all()
    return list(items)
