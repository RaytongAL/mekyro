from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.audit import record_audit
from app.core.dependencies import CurrentUser, PlatformAdmin, SessionDep
from app.core.models import User, Workspace, WorkspaceMember, WorkspacePromptVersion, new_id
from app.core.security import hash_password

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceMemberSummary(BaseModel):
    user_id: str
    username: str
    nickname: str
    phone: str
    email: str
    user_is_active: bool
    is_platform_admin: bool
    name: str
    role: str


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    slug: str
    description: str
    site_type: str
    prompt: str
    daily_lead_limit: int
    email_outreach_enabled: bool
    is_active: bool
    created_at: datetime
    role: str
    members: list[WorkspaceMemberSummary] = Field(default_factory=list)


class WorkspaceListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[WorkspaceResponse]


class SupplierRegistrationRequest(BaseModel):
    username: str = Field(min_length=3, max_length=150, pattern=r"^[a-zA-Z0-9_.-]+$")
    email: str = Field(
        min_length=5,
        max_length=254,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    )
    display_name: str = Field(min_length=1, max_length=150)
    country_code: str = Field(default="+86", min_length=1, max_length=10)
    phone: str = Field(default="", max_length=30)
    password: str = Field(min_length=10, max_length=128)
    workspace_name: str = Field(min_length=2, max_length=200)
    workspace_slug: str = Field(min_length=3, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: str = Field(default="", max_length=2000)
    site_type: str = Field(default="none", pattern=r"^(none|shopify|vendure|independent)$")
    prompt: str = Field(default="", max_length=20000)
    daily_lead_limit: int = Field(default=0, ge=0, le=1_000_000)
    email_outreach_enabled: bool = True
    vendure_channels_token: str = Field(default="", max_length=255)
    vendure_url: str = Field(default="", max_length=500)

    @field_validator("username", "email", "workspace_slug", mode="before")
    @classmethod
    def normalize_identity(cls, value: str) -> str:
        return value.strip().lower()


class SupplierRegistrationResponse(BaseModel):
    user_id: str
    workspace_id: str
    username: str
    workspace_slug: str


@router.get("", response_model=WorkspaceListResponse)
async def list_workspaces(
    user: CurrentUser,
    session: SessionDep,
    include_inactive: bool = Query(default=False),
    ordering: Literal["id", "-id", "created_at", "-created_at", "name", "-name"] = "-id",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> WorkspaceListResponse:
    ordering_map = {
        "id": Workspace.created_at.asc(),
        "-id": Workspace.created_at.desc(),
        "created_at": Workspace.created_at.asc(),
        "-created_at": Workspace.created_at.desc(),
        "name": Workspace.name.asc(),
        "-name": Workspace.name.desc(),
    }
    if user.is_platform_admin:
        filters = [] if include_inactive else [Workspace.is_active.is_(True)]
        total = (
            await session.scalar(select(func.count()).select_from(Workspace).where(*filters))
            or 0
        )
        rows = (
            await session.scalars(
                select(Workspace)
                .where(*filters)
                .order_by(ordering_map[ordering])
                .limit(limit)
                .offset(offset)
            )
        ).all()
        workspace_ids = [item.id for item in rows]
        member_rows = (
            await session.execute(
                select(WorkspaceMember, User)
                .join(User, User.id == WorkspaceMember.user_id)
                .where(WorkspaceMember.workspace_id.in_(workspace_ids))
                .order_by(WorkspaceMember.created_at.asc())
            )
        ).all()
        members_by_workspace: dict[str, list[WorkspaceMemberSummary]] = {
            workspace_id: [] for workspace_id in workspace_ids
        }
        for member, member_user in member_rows:
            members_by_workspace[member.workspace_id].append(
                WorkspaceMemberSummary(
                    user_id=member_user.id,
                    username=member_user.username,
                    nickname=member_user.nickname,
                    phone=member_user.phone,
                    email=member_user.email,
                    user_is_active=member_user.is_active,
                    is_platform_admin=member_user.is_platform_admin,
                    name=member.name,
                    role=member.role,
                )
            )
        return WorkspaceListResponse(
            total=total,
            limit=limit,
            offset=offset,
            items=[
                WorkspaceResponse(
                    id=item.id,
                    name=item.name,
                    slug=item.slug,
                    description=item.description,
                    site_type=item.site_type,
                    prompt=item.prompt,
                    daily_lead_limit=item.daily_lead_limit,
                    email_outreach_enabled=item.email_outreach_enabled,
                    is_active=item.is_active,
                    created_at=item.created_at,
                    role="platform_admin",
                    members=members_by_workspace[item.id],
                )
                for item in rows
            ],
        )

    membership_filters = [
        WorkspaceMember.user_id == user.id,
        Workspace.is_active.is_(True),
    ]
    total = (
        await session.scalar(
            select(func.count())
            .select_from(Workspace)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(*membership_filters)
        )
        or 0
    )
    query = (
        select(Workspace, WorkspaceMember.role)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(*membership_filters)
        .order_by(ordering_map[ordering])
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(query)).all()
    return WorkspaceListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            WorkspaceResponse(
                id=workspace.id,
                name=workspace.name,
                slug=workspace.slug,
                description=workspace.description,
                site_type=workspace.site_type,
                prompt=workspace.prompt,
                daily_lead_limit=workspace.daily_lead_limit,
                email_outreach_enabled=workspace.email_outreach_enabled,
                is_active=workspace.is_active,
                created_at=workspace.created_at,
                role=role,
                members=[],
            )
            for workspace, role in rows
        ],
    )


@router.post("", response_model=SupplierRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def register_supplier(
    payload: SupplierRegistrationRequest,
    admin: PlatformAdmin,
    session: SessionDep,
) -> SupplierRegistrationResponse:
    duplicate_user = await session.scalar(
        select(User.id).where((User.username == payload.username) | (User.email == payload.email))
    )
    duplicate_phone = None
    if payload.phone:
        duplicate_phone = await session.scalar(select(User.id).where(User.phone == payload.phone))
    duplicate_workspace = await session.scalar(
        select(Workspace.id).where(Workspace.slug == payload.workspace_slug)
    )
    if duplicate_user or duplicate_phone or duplicate_workspace:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username, email, phone or workspace slug already exists",
        )

    user = User(
        id=new_id(),
        username=payload.username,
        email=payload.email,
        display_name=payload.display_name,
        nickname=payload.display_name,
        country_code=payload.country_code,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
    )
    workspace = Workspace(
        id=new_id(),
        name=payload.workspace_name,
        slug=payload.workspace_slug,
        description=payload.description,
        site_type=payload.site_type,
        prompt=payload.prompt,
        prompt_version=1,
        daily_lead_limit=payload.daily_lead_limit,
        email_outreach_enabled=payload.email_outreach_enabled,
        vendure_channels_token=payload.vendure_channels_token,
        vendure_url=payload.vendure_url,
    )
    session.add_all([user, workspace])
    await session.flush()
    session.add(
        WorkspaceMember(
            id=new_id(),
            workspace_id=workspace.id,
            user_id=user.id,
            name=payload.display_name,
            role="owner",
        )
    )
    session.add(
        WorkspacePromptVersion(
            id=new_id(),
            workspace_id=workspace.id,
            version=1,
            prompt=workspace.prompt,
            daily_lead_limit=workspace.daily_lead_limit,
            created_by=admin.id,
        )
    )
    record_audit(
        session,
        workspace_id=workspace.id,
        actor_user_id=admin.id,
        action="workspace.supplier_registered",
        entity_type="workspace",
        entity_id=workspace.id,
        payload={"username": user.username, "workspace_slug": workspace.slug},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username, email, phone or workspace slug already exists",
        ) from exc
    return SupplierRegistrationResponse(
        user_id=user.id,
        workspace_id=workspace.id,
        username=user.username,
        workspace_slug=workspace.slug,
    )
