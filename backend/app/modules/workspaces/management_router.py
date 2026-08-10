from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.audit import record_audit
from app.core.dependencies import (
    PlatformAdmin,
    SessionDep,
    WorkspaceDep,
    WorkspaceWriteDep,
)
from app.core.models import (
    User,
    Workspace,
    WorkspaceMember,
    WorkspacePromptVersion,
    new_id,
)
from app.modules.workspaces.onboarding_router import normalize_state

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


def _mask_secret(value: str) -> str:
    if not value:
        return ""
    return f"{'*' * max(4, min(len(value) - 4, 12))}{value[-4:]}"


def _onboarding_status(state: dict | None) -> str:
    return str((state or {}).get("status") or "not_started")


class WorkspaceDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    description: str
    site_type: str
    lead_acquisition_requirement: str
    prompt: str
    prompt_version: int
    daily_lead_limit: int
    email_outreach_enabled: bool
    vendure_url: str
    vendure_channels_token_configured: bool
    vendure_channels_token_masked: str
    is_active: bool
    role: str
    onboarding_status: str


class WorkspaceSelfUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    site_type: Literal["none", "shopify", "vendure", "independent"] | None = None
    lead_acquisition_requirement: str | None = Field(default=None, max_length=2000)
    prompt: str | None = Field(default=None, max_length=20000)
    daily_lead_limit: int | None = Field(default=None, ge=0, le=1_000_000)
    email_outreach_enabled: bool | None = None
    vendure_channels_token: str | None = Field(default=None, max_length=255)
    vendure_url: str | None = Field(default=None, max_length=500)


class PromptResponse(BaseModel):
    workspace_id: str
    workspace_name: str
    prompt: str
    version: int
    daily_lead_limit: int


class PromptUpdateRequest(BaseModel):
    prompt: str = Field(max_length=20000)
    daily_lead_limit: int = Field(default=0, ge=0, le=1_000_000)


class PromptVersionResponse(BaseModel):
    id: str
    version: int
    prompt: str
    daily_lead_limit: int
    created_by: str
    created_at: str


class OwnerResponse(BaseModel):
    id: str
    username: str
    email: str
    display_name: str
    nickname: str
    country_code: str
    phone: str
    is_active: bool
    role: str


class SupplierAccountDetailResponse(BaseModel):
    workspace: WorkspaceDetailResponse
    owner: OwnerResponse


class SupplierAccountUpdateRequest(BaseModel):
    workspace_name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    site_type: Literal["none", "shopify", "vendure", "independent"] | None = None
    workspace_is_active: bool | None = None
    owner_display_name: str | None = Field(default=None, min_length=1, max_length=150)
    owner_nickname: str | None = Field(default=None, min_length=1, max_length=150)
    owner_country_code: str | None = Field(default=None, min_length=1, max_length=10)
    owner_phone: str | None = Field(default=None, max_length=30)
    owner_email: str | None = Field(
        default=None,
        min_length=5,
        max_length=254,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    )
    owner_is_active: bool | None = None
    owner_role: Literal["owner", "admin"] | None = None
    prompt: str | None = Field(default=None, max_length=20000)
    daily_lead_limit: int | None = Field(default=None, ge=0, le=1_000_000)
    email_outreach_enabled: bool | None = None
    vendure_channels_token: str | None = Field(default=None, max_length=255)
    vendure_url: str | None = Field(default=None, max_length=500)


async def _get_workspace(workspace_id: str, session: SessionDep) -> Workspace:
    workspace = await session.get(Workspace, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


async def _get_primary_owner(workspace_id: str, session: SessionDep) -> WorkspaceMember:
    owner = await session.scalar(
        select(WorkspaceMember)
        .where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.role == "owner")
        .options(selectinload(WorkspaceMember.user))
        .order_by(WorkspaceMember.created_at.asc())
    )
    if owner is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Workspace owner not found"
        )
    return owner


def _detail(workspace: Workspace, role: str) -> WorkspaceDetailResponse:
    onboarding = normalize_state(workspace.onboarding_state)
    return WorkspaceDetailResponse(
        id=workspace.id,
        name=workspace.name,
        slug=workspace.slug,
        description=workspace.description,
        site_type=workspace.site_type,
        lead_acquisition_requirement=(
            onboarding.get("lead_acquisition_requirement")
            or workspace.lead_acquisition_requirement
        ),
        prompt=workspace.prompt,
        prompt_version=workspace.prompt_version,
        daily_lead_limit=workspace.daily_lead_limit,
        email_outreach_enabled=workspace.email_outreach_enabled,
        vendure_url=workspace.vendure_url,
        vendure_channels_token_configured=bool(workspace.vendure_channels_token),
        vendure_channels_token_masked=_mask_secret(workspace.vendure_channels_token),
        is_active=workspace.is_active,
        role=role,
        onboarding_status=_onboarding_status(onboarding),
    )


def _owner_response(member: WorkspaceMember) -> OwnerResponse:
    user = member.user
    return OwnerResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        nickname=user.nickname,
        country_code=user.country_code,
        phone=user.phone,
        is_active=user.is_active,
        role=member.role,
    )


@router.get("/{workspace_id}", response_model=WorkspaceDetailResponse)
async def get_workspace_detail(context: WorkspaceDep) -> WorkspaceDetailResponse:
    return _detail(context.workspace, context.role)


@router.patch("/{workspace_id}", response_model=WorkspaceDetailResponse)
async def update_workspace(
    payload: WorkspaceSelfUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> WorkspaceDetailResponse:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No fields to update"
        )
    if "lead_acquisition_requirement" in changes:
        requirement = str(changes["lead_acquisition_requirement"]).strip()
        if not requirement:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Lead acquisition requirement cannot be empty",
            )
        state = normalize_state(context.workspace.onboarding_state)
        current_requirement = str(
            state.get("lead_acquisition_requirement")
            or context.workspace.lead_acquisition_requirement
            or ""
        ).strip()
        leads = state["steps"]["leads"]
        execution = leads.get("execution")
        if (
            requirement != current_requirement
            and isinstance(execution, dict)
            and execution.get("status") in {"processing", "result_unknown"}
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Lead acquisition requirement execution is active",
            )
        changes["lead_acquisition_requirement"] = requirement
        state["lead_acquisition_requirement"] = requirement
        pending = leads.get("pending_card")
        if (
            isinstance(pending, dict)
            and pending.get("kind") == "lead_requirement"
            and requirement != current_requirement
        ):
            leads["pending_card"] = None
            leads["answers"] = {}
            leads["execution"] = None
            if leads.get("status") != "confirmed":
                leads["status"] = "pending"
        context.workspace.onboarding_state = state
    prompt_changed = "prompt" in changes or "daily_lead_limit" in changes
    for field_name, value in changes.items():
        setattr(context.workspace, field_name, value)
    if prompt_changed:
        context.workspace.prompt_version += 1
        session.add(
            WorkspacePromptVersion(
                id=new_id(),
                workspace_id=context.workspace.id,
                version=context.workspace.prompt_version,
                prompt=context.workspace.prompt,
                daily_lead_limit=context.workspace.daily_lead_limit,
                created_by=context.user.id,
            )
        )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="workspace.updated",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"fields": sorted(changes)},
    )
    await session.commit()
    return _detail(context.workspace, context.role)


@router.get("/{workspace_id}/prompt", response_model=PromptResponse)
async def get_prompt(context: WorkspaceDep) -> PromptResponse:
    return PromptResponse(
        workspace_id=context.workspace.id,
        workspace_name=context.workspace.name,
        prompt=context.workspace.prompt,
        version=context.workspace.prompt_version,
        daily_lead_limit=context.workspace.daily_lead_limit,
    )


@router.put("/{workspace_id}/prompt", response_model=PromptResponse)
async def update_prompt(
    payload: PromptUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> PromptResponse:
    context.workspace.prompt = payload.prompt
    context.workspace.daily_lead_limit = payload.daily_lead_limit
    context.workspace.prompt_version += 1
    session.add(
        WorkspacePromptVersion(
            id=new_id(),
            workspace_id=context.workspace.id,
            version=context.workspace.prompt_version,
            prompt=context.workspace.prompt,
            daily_lead_limit=context.workspace.daily_lead_limit,
            created_by=context.user.id,
        )
    )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="workspace.prompt_updated",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"version": context.workspace.prompt_version},
    )
    await session.commit()
    return await get_prompt(context)


@router.get("/{workspace_id}/prompt/versions", response_model=list[PromptVersionResponse])
async def list_prompt_versions(
    context: WorkspaceDep,
    session: SessionDep,
) -> list[PromptVersionResponse]:
    versions = (
        await session.scalars(
            select(WorkspacePromptVersion)
            .where(WorkspacePromptVersion.workspace_id == context.workspace.id)
            .order_by(WorkspacePromptVersion.version.asc())
        )
    ).all()
    return [
        PromptVersionResponse(
            id=item.id,
            version=item.version,
            prompt=item.prompt,
            daily_lead_limit=item.daily_lead_limit,
            created_by=item.created_by,
            created_at=item.created_at.isoformat(),
        )
        for item in versions
    ]


@router.get("/{workspace_id}/supplier-account", response_model=SupplierAccountDetailResponse)
async def get_supplier_account(
    workspace_id: str,
    admin: PlatformAdmin,
    session: SessionDep,
) -> SupplierAccountDetailResponse:
    workspace = await _get_workspace(workspace_id, session)
    owner = await _get_primary_owner(workspace.id, session)
    return SupplierAccountDetailResponse(
        workspace=_detail(workspace, "platform_admin"),
        owner=_owner_response(owner),
    )


@router.patch("/{workspace_id}/supplier-account", response_model=SupplierAccountDetailResponse)
async def update_supplier_account(
    workspace_id: str,
    payload: SupplierAccountUpdateRequest,
    admin: PlatformAdmin,
    session: SessionDep,
) -> SupplierAccountDetailResponse:
    workspace = await _get_workspace(workspace_id, session)
    owner = await _get_primary_owner(workspace.id, session)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No fields to update"
        )
    user_changes = {
        "display_name": changes.pop("owner_display_name", None),
        "nickname": changes.pop("owner_nickname", None),
        "country_code": changes.pop("owner_country_code", None),
        "phone": changes.pop("owner_phone", None),
        "email": changes.pop("owner_email", None),
        "is_active": changes.pop("owner_is_active", None),
    }
    user_changes = {key: value for key, value in user_changes.items() if value is not None}
    if "email" in user_changes:
        user_changes["email"] = user_changes["email"].strip().lower()
        duplicate = await session.scalar(
            select(User.id).where(User.email == user_changes["email"], User.id != owner.user_id)
        )
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    if "phone" in user_changes and user_changes["phone"]:
        duplicate = await session.scalar(
            select(User.id).where(User.phone == user_changes["phone"], User.id != owner.user_id)
        )
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already exists")
    role = changes.pop("owner_role", None)
    if role is not None and role != owner.role:
        owner_count = await session.scalar(
            select(func.count())
            .select_from(WorkspaceMember)
            .where(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.role == "owner",
            )
        )
        if role == "admin" and (owner_count or 0) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Workspace must retain an owner"
            )
        owner.role = role
    workspace_changes = {
        "name": changes.pop("workspace_name", None),
        "description": changes.pop("description", None),
        "site_type": changes.pop("site_type", None),
        "is_active": changes.pop("workspace_is_active", None),
        "prompt": changes.pop("prompt", None),
        "daily_lead_limit": changes.pop("daily_lead_limit", None),
        "email_outreach_enabled": changes.pop("email_outreach_enabled", None),
        "vendure_channels_token": changes.pop("vendure_channels_token", None),
        "vendure_url": changes.pop("vendure_url", None),
    }
    workspace_changes = {
        key: value for key, value in workspace_changes.items() if value is not None
    }
    prompt_changed = "prompt" in workspace_changes or "daily_lead_limit" in workspace_changes
    for field_name, value in user_changes.items():
        setattr(owner.user, field_name, value)
    for field_name, value in workspace_changes.items():
        setattr(workspace, field_name, value)
    if workspace_changes.get("is_active") is False:
        owner.user.is_active = False
    if workspace_changes.get("is_active") is True and "is_active" not in user_changes:
        owner.user.is_active = True
    if prompt_changed:
        workspace.prompt_version += 1
        session.add(
            WorkspacePromptVersion(
                id=new_id(),
                workspace_id=workspace.id,
                version=workspace.prompt_version,
                prompt=workspace.prompt,
                daily_lead_limit=workspace.daily_lead_limit,
                created_by=admin.id,
            )
        )
    record_audit(
        session,
        workspace_id=None if workspace_changes.get("is_active") is False else workspace.id,
        actor_user_id=admin.id,
        action="workspace.supplier_account_updated",
        entity_type="workspace",
        entity_id=workspace.id,
        payload={
            "workspace_fields": sorted(workspace_changes),
            "user_fields": sorted(user_changes),
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier account update conflicts with existing data",
        ) from exc
    return SupplierAccountDetailResponse(
        workspace=_detail(workspace, "platform_admin"),
        owner=_owner_response(owner),
    )


@router.delete("/{workspace_id}/supplier-account", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier_account(
    workspace_id: str,
    admin: PlatformAdmin,
    session: SessionDep,
    hard: bool = Query(default=False),
) -> None:
    workspace = await _get_workspace(workspace_id, session)
    members = list(
        (
            await session.scalars(
                select(WorkspaceMember)
                .where(WorkspaceMember.workspace_id == workspace.id)
                .options(selectinload(WorkspaceMember.user))
            )
        ).all()
    )
    if not hard:
        if not workspace.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Workspace is already inactive"
            )
        workspace.is_active = False
        for member in members:
            if member.role == "owner" and not member.user.is_platform_admin:
                member.user.is_active = False
        record_audit(
            session,
            workspace_id=workspace.id,
            actor_user_id=admin.id,
            action="workspace.deactivated",
            entity_type="workspace",
            entity_id=workspace.id,
            payload={},
        )
        await session.commit()
        return

    user_ids = {member.user_id for member in members}
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=admin.id,
        action="workspace.hard_deleted",
        entity_type="workspace",
        entity_id=workspace.id,
        payload={"member_count": len(members)},
    )
    await session.execute(
        delete(Workspace)
        .where(Workspace.id == workspace.id)
        .execution_options(synchronize_session=False)
    )
    for user_id in user_ids:
        user = await session.get(User, user_id)
        if user is None or user.is_platform_admin:
            continue
        memberships = await session.scalar(
            select(func.count())
            .select_from(WorkspaceMember)
            .where(WorkspaceMember.user_id == user_id)
        )
        if (memberships or 0) == 0:
            await session.delete(user)
    await session.commit()
