import hashlib
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_session
from app.core.models import ApiKey, User, Workspace, WorkspaceMember, utcnow
from app.core.security import decode_access_token

bearer = HTTPBearer(auto_error=False)
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing access token")
    try:
        user_id = decode_access_token(credentials.credentials, settings)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token"
        ) from exc

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_platform_admin(user: CurrentUser) -> User:
    if not user.is_platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin required")
    return user


PlatformAdmin = Annotated[User, Depends(get_platform_admin)]


@dataclass(frozen=True)
class WorkspaceContext:
    workspace: Workspace
    user: User
    role: str


async def get_workspace_context(
    user: CurrentUser,
    session: SessionDep,
    workspace_id: Annotated[str, Path()],
) -> WorkspaceContext:
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None or not workspace.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    if user.is_platform_admin:
        return WorkspaceContext(workspace=workspace, user=user, role="platform_admin")

    membership = await session.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace access denied")
    return WorkspaceContext(workspace=workspace, user=user, role=membership.role)


WorkspaceDep = Annotated[WorkspaceContext, Depends(get_workspace_context)]


async def get_workspace_writer(context: WorkspaceDep) -> WorkspaceContext:
    if context.role not in {"owner", "admin", "platform_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace write denied")
    return context


WorkspaceWriteDep = Annotated[WorkspaceContext, Depends(get_workspace_writer)]


async def get_workspace_owner(context: WorkspaceDep) -> WorkspaceContext:
    if context.role not in {"owner", "platform_admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Workspace owner required"
        )
    return context


WorkspaceOwnerDep = Annotated[WorkspaceContext, Depends(get_workspace_owner)]


@dataclass(frozen=True)
class ApiKeyContext:
    """Authenticated API key plus its immutable tenant scope."""

    key: ApiKey
    user: User
    workspace: Workspace

    @property
    def workspace_id(self) -> str:
        return self.workspace.id

    @property
    def permissions(self) -> frozenset[str]:
        return frozenset(str(item) for item in (self.key.permissions or []))


async def get_api_key_context(
    session: SessionDep,
    raw_key: Annotated[str | None, Header(alias="X-Api-Key")] = None,
) -> ApiKeyContext:
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    key_record = await session.scalar(select(ApiKey).where(ApiKey.key_hash == key_hash))
    if key_record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    if not key_record.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key is disabled")
    user = await session.get(User, key_record.user_id)
    workspace = await session.get(Workspace, key_record.workspace_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="API key owner is inactive"
        )
    if workspace is None or not workspace.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="API key Workspace is inactive"
        )
    key_record.last_used_at = utcnow()
    await session.commit()
    return ApiKeyContext(key=key_record, user=user, workspace=workspace)


ApiKeyDep = Annotated[ApiKeyContext, Depends(get_api_key_context)]


def require_api_key_permission(permission: str):
    async def dependency(context: ApiKeyDep) -> ApiKeyContext:
        if permission not in context.permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key permission required: {permission}",
            )
        return context

    return dependency


def api_key_permission(permission: str):
    return Annotated[ApiKeyContext, Depends(require_api_key_permission(permission))]
