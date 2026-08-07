import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.audit import record_audit
from app.core.dependencies import (
    CurrentUser,
    SessionDep,
    WorkspaceDep,
    WorkspaceOwnerDep,
    WorkspaceWriteDep,
)
from app.core.models import User, WorkspaceInvitation, WorkspaceMember, new_id

router = APIRouter(prefix="/workspaces/{workspace_id}/members", tags=["workspace-members"])
invitation_router = APIRouter(prefix="/workspace-invitations", tags=["workspace-members"])

MemberRole = Literal["owner", "admin", "member"]


class MemberResponse(BaseModel):
    id: str
    user_id: str
    username: str
    email: str
    display_name: str
    name: str
    role: str
    user_is_active: bool
    created_at: datetime


class MemberRoleUpdateRequest(BaseModel):
    role: MemberRole
    name: str | None = Field(default=None, min_length=1, max_length=150)


class InvitationCreateRequest(BaseModel):
    email: str = Field(
        min_length=5,
        max_length=254,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    )
    role: MemberRole = "member"
    expires_in_days: int = Field(default=7, ge=1, le=30)


class InvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: str
    token_prefix: str
    status: str
    expires_at: datetime
    invited_by: str
    accepted_by: str | None
    accepted_at: datetime | None
    created_at: datetime


class InvitationCreatedResponse(InvitationResponse):
    invite_token: str


class InvitationAcceptRequest(BaseModel):
    invite_token: str = Field(min_length=20, max_length=200)


class InvitationAcceptedResponse(BaseModel):
    workspace_id: str
    membership: MemberResponse
    idempotent: bool = False


def _member_response(member: WorkspaceMember) -> MemberResponse:
    return MemberResponse(
        id=member.id,
        user_id=member.user_id,
        username=member.user.username,
        email=member.user.email,
        display_name=member.user.display_name,
        name=member.name,
        role=member.role,
        user_is_active=member.user.is_active,
        created_at=member.created_at,
    )


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def _load_member(
    workspace_id: str,
    user_id: str,
    session: SessionDep,
) -> WorkspaceMember:
    member = await session.scalar(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id)
        .options(selectinload(WorkspaceMember.user))
    )
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Workspace member not found"
        )
    return member


async def _owner_count(workspace_id: str, session: SessionDep) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(WorkspaceMember)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.role == "owner",
        )
    )
    return count or 0


@router.get("", response_model=list[MemberResponse])
async def list_members(
    context: WorkspaceDep,
    session: SessionDep,
) -> list[MemberResponse]:
    members = (
        await session.scalars(
            select(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == context.workspace.id)
            .options(selectinload(WorkspaceMember.user))
            .order_by(WorkspaceMember.created_at.asc())
        )
    ).all()
    return [_member_response(member) for member in members]


@router.post(
    "/invitations",
    response_model=InvitationCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_invitation(
    payload: InvitationCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> InvitationCreatedResponse:
    if payload.role == "owner" and context.role not in {"owner", "platform_admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Only an owner can invite an owner"
        )
    email = payload.email.strip().lower()
    existing_member = await session.scalar(
        select(WorkspaceMember.id)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == context.workspace.id, User.email == email)
    )
    if existing_member is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member")
    pending = await session.scalar(
        select(WorkspaceInvitation).where(
            WorkspaceInvitation.workspace_id == context.workspace.id,
            WorkspaceInvitation.email == email,
            WorkspaceInvitation.status == "pending",
            WorkspaceInvitation.expires_at > datetime.now(UTC),
        )
    )
    if pending is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A pending invitation already exists"
        )
    secret = f"mki_{secrets.token_urlsafe(32)}"
    invitation = WorkspaceInvitation(
        id=new_id(),
        workspace_id=context.workspace.id,
        email=email,
        role=payload.role,
        token_prefix=secret[:12],
        token_hash=hashlib.sha256(secret.encode()).hexdigest(),
        status="pending",
        expires_at=datetime.now(UTC) + timedelta(days=payload.expires_in_days),
        invited_by=context.user.id,
    )
    session.add(invitation)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="workspace.invitation_created",
        entity_type="workspace_invitation",
        entity_id=invitation.id,
        payload={"email": email, "role": payload.role},
    )
    await session.commit()
    return InvitationCreatedResponse.model_validate(
        {**InvitationResponse.model_validate(invitation).model_dump(), "invite_token": secret}
    )


@router.get("/invitations", response_model=list[InvitationResponse])
async def list_invitations(
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> list[WorkspaceInvitation]:
    await session.execute(
        update(WorkspaceInvitation)
        .where(
            WorkspaceInvitation.workspace_id == context.workspace.id,
            WorkspaceInvitation.status == "pending",
            WorkspaceInvitation.expires_at <= datetime.now(UTC),
        )
        .values(status="expired")
    )
    await session.commit()
    return list(
        (
            await session.scalars(
                select(WorkspaceInvitation)
                .where(WorkspaceInvitation.workspace_id == context.workspace.id)
                .order_by(WorkspaceInvitation.created_at.desc())
            )
        ).all()
    )


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invitation(
    invitation_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    invitation = await session.scalar(
        select(WorkspaceInvitation).where(
            WorkspaceInvitation.id == invitation_id,
            WorkspaceInvitation.workspace_id == context.workspace.id,
        )
    )
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Only a pending invitation can be revoked"
        )
    invitation.status = "revoked"
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="workspace.invitation_revoked",
        entity_type="workspace_invitation",
        entity_id=invitation.id,
        payload={"email": invitation.email},
    )
    await session.commit()


@invitation_router.post("/accept", response_model=InvitationAcceptedResponse)
async def accept_invitation(
    payload: InvitationAcceptRequest,
    user: CurrentUser,
    session: SessionDep,
) -> InvitationAcceptedResponse:
    token_hash = hashlib.sha256(payload.invite_token.encode()).hexdigest()
    invitation = await session.scalar(
        select(WorkspaceInvitation).where(WorkspaceInvitation.token_hash == token_hash)
    )
    if invitation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")
    if invitation.status == "accepted" and invitation.accepted_by == user.id:
        membership = await _load_member(invitation.workspace_id, user.id, session)
        return InvitationAcceptedResponse(
            workspace_id=invitation.workspace_id,
            membership=_member_response(membership),
            idempotent=True,
        )
    if invitation.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Invitation is no longer active"
        )
    if _aware(invitation.expires_at) <= datetime.now(UTC):
        invitation.status = "expired"
        await session.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invitation has expired")
    if invitation.email != user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invitation email does not match current user",
        )
    existing = await session.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == invitation.workspace_id,
            WorkspaceMember.user_id == user.id,
        )
    )
    if existing is None:
        existing = WorkspaceMember(
            id=new_id(),
            workspace_id=invitation.workspace_id,
            user_id=user.id,
            name=user.display_name or user.nickname or user.username,
            role=invitation.role,
        )
        session.add(existing)
    invitation.status = "accepted"
    invitation.accepted_by = user.id
    invitation.accepted_at = datetime.now(UTC)
    record_audit(
        session,
        workspace_id=invitation.workspace_id,
        actor_user_id=user.id,
        action="workspace.invitation_accepted",
        entity_type="workspace_invitation",
        entity_id=invitation.id,
        payload={"role": invitation.role},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Membership already exists"
        ) from exc
    return InvitationAcceptedResponse(
        workspace_id=invitation.workspace_id,
        membership=_member_response(await _load_member(invitation.workspace_id, user.id, session)),
    )


@router.patch("/{user_id}", response_model=MemberResponse)
async def update_member(
    user_id: str,
    payload: MemberRoleUpdateRequest,
    context: WorkspaceOwnerDep,
    session: SessionDep,
) -> MemberResponse:
    member = await _load_member(context.workspace.id, user_id, session)
    if member.role == "owner" and payload.role != "owner":
        if await _owner_count(context.workspace.id, session) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Workspace must retain an owner"
            )
    old_role = member.role
    member.role = payload.role
    if payload.name is not None:
        member.name = payload.name
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="workspace.member_updated",
        entity_type="workspace_member",
        entity_id=member.id,
        payload={"user_id": member.user_id, "from_role": old_role, "to_role": member.role},
    )
    await session.commit()
    return _member_response(member)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    user_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    member = await _load_member(context.workspace.id, user_id, session)
    if context.role == "admin" and member.role != "member" and member.user_id != context.user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin can only remove members"
        )
    if member.role == "owner" and await _owner_count(context.workspace.id, session) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Workspace must retain an owner"
        )
    await session.delete(member)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="workspace.member_removed",
        entity_type="workspace_member",
        entity_id=member.id,
        payload={"user_id": member.user_id, "role": member.role},
    )
    await session.commit()
