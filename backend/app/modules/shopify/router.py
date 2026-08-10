from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.audit import record_audit
from app.core.config import Settings, get_settings
from app.core.dependencies import PlatformAdmin, SessionDep, WorkspaceDep, WorkspaceWriteDep
from app.core.models import OutboxMessage, ShopifyConfig, Workspace, new_id
from app.core.secrets import decrypt_secret, encrypt_secret, mask_secret
from app.modules.shopify.client import clear_shopify_caches

router = APIRouter(prefix="/internal/shopify-configs", tags=["shopify"])
workspace_router = APIRouter(prefix="/workspaces/{workspace_id}/shopify", tags=["shopify"])


class ShopifyConfigCreateRequest(BaseModel):
    workspace_id: str = Field(min_length=1, max_length=36)
    store_url: str = Field(default="", max_length=500)
    api_version: str = Field(default="2026-04", min_length=4, max_length=20)
    api_key: str = Field(default="", max_length=200)
    api_secret_key: str = Field(default="", max_length=200)
    grant_type: str = Field(default="client_credentials", min_length=1, max_length=50)


class ShopifyConfigUpdateRequest(BaseModel):
    store_url: str | None = Field(default=None, max_length=500)
    api_version: str | None = Field(default=None, min_length=4, max_length=20)
    api_key: str | None = Field(default=None, max_length=200)
    api_secret_key: str | None = Field(default=None, max_length=200)
    grant_type: str | None = Field(default=None, min_length=1, max_length=50)


class WorkspaceShopifyConfigRequest(ShopifyConfigUpdateRequest):
    pass


class ShopifyConfigStatusRequest(BaseModel):
    is_active: bool


class ShopifyConfigResponse(BaseModel):
    workspace_id: str
    workspace_name: str
    description: str
    site_type: str
    config_id: str | None
    store_url: str
    api_version: str
    api_key_configured: bool
    api_key_masked: str
    api_secret_key_configured: bool
    api_secret_key_masked: str
    grant_type: str
    is_active: bool
    is_ready: bool
    has_config: bool
    created_at: datetime | None
    updated_at: datetime | None


class ShopifyConfigListResponse(BaseModel):
    configs: list[ShopifyConfigResponse]
    total: int
    page: int
    page_size: int


class ShopifySyncRequest(BaseModel):
    operation: str = Field(default="catalog", pattern=r"^(catalog|inventory|full)$")
    product_ids: list[str] = Field(default_factory=list, max_length=500)


class ShopifySyncJobResponse(BaseModel):
    id: str
    workspace_id: str
    operation: str
    product_ids: list[str]
    status: str
    attempts: int
    available_at: datetime
    processed_at: datetime | None
    last_error: str
    created_at: datetime


def _normalize_store_url(value: str) -> str:
    normalized = value.strip().rstrip("/")
    if normalized and not normalized.startswith("https://"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Shopify store URL must use HTTPS",
        )
    return normalized


def _format_config(
    workspace: Workspace,
    config: ShopifyConfig | None,
    settings: Settings,
) -> ShopifyConfigResponse:
    if config is None:
        return ShopifyConfigResponse(
            workspace_id=workspace.id,
            workspace_name=workspace.name,
            description=workspace.description,
            site_type=workspace.site_type,
            config_id=None,
            store_url="",
            api_version="2026-04",
            api_key_configured=False,
            api_key_masked="",
            api_secret_key_configured=False,
            api_secret_key_masked="",
            grant_type="client_credentials",
            is_active=False,
            is_ready=False,
            has_config=False,
            created_at=None,
            updated_at=None,
        )
    api_key = decrypt_secret(config.api_key_encrypted, settings)
    api_secret = decrypt_secret(config.api_secret_encrypted, settings)
    return ShopifyConfigResponse(
        workspace_id=workspace.id,
        workspace_name=workspace.name,
        description=workspace.description,
        site_type=workspace.site_type,
        config_id=config.id,
        store_url=config.store_url,
        api_version=config.api_version,
        api_key_configured=bool(api_key),
        api_key_masked=mask_secret(api_key),
        api_secret_key_configured=bool(api_secret),
        api_secret_key_masked=mask_secret(api_secret),
        grant_type=config.grant_type,
        is_active=config.is_active,
        is_ready=config.is_ready,
        has_config=True,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


@workspace_router.get("/config", response_model=ShopifyConfigResponse)
async def get_workspace_shopify_config(
    context: WorkspaceDep,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ShopifyConfigResponse:
    config = await session.scalar(
        select(ShopifyConfig).where(ShopifyConfig.workspace_id == context.workspace.id)
    )
    return _format_config(context.workspace, config, settings)


@workspace_router.put("/config", response_model=ShopifyConfigResponse)
async def upsert_workspace_shopify_config(
    payload: WorkspaceShopifyConfigRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ShopifyConfigResponse:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="No fields to update",
        )
    config = await session.scalar(
        select(ShopifyConfig).where(ShopifyConfig.workspace_id == context.workspace.id)
    )
    created = config is None
    if config is None:
        config = ShopifyConfig(id=new_id(), workspace_id=context.workspace.id)
        session.add(config)
    for field_name, value in changes.items():
        if field_name == "api_key":
            config.api_key_encrypted = encrypt_secret(value, settings)
        elif field_name == "api_secret_key":
            config.api_secret_encrypted = encrypt_secret(value, settings)
        elif field_name == "store_url":
            config.store_url = _normalize_store_url(value)
        else:
            setattr(config, field_name, value)
    config.is_active = False
    clear_shopify_caches(context.workspace.id)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action=("shopify.config_created" if created else "shopify.config_updated"),
        entity_type="shopify_config",
        entity_id=config.id,
        payload={"fields": sorted(changes), "is_active": False},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workspace Shopify configuration changed concurrently",
        ) from exc
    return _format_config(context.workspace, config, settings)


@router.get("", response_model=ShopifyConfigListResponse)
async def list_shopify_configs(
    admin: PlatformAdmin,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ShopifyConfigListResponse:
    del admin
    total = await session.scalar(select(func.count()).select_from(Workspace)) or 0
    rows = (
        await session.execute(
            select(Workspace, ShopifyConfig)
            .outerjoin(ShopifyConfig, ShopifyConfig.workspace_id == Workspace.id)
            .order_by(Workspace.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).all()
    return ShopifyConfigListResponse(
        configs=[_format_config(workspace, config, settings) for workspace, config in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ShopifyConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_shopify_config(
    payload: ShopifyConfigCreateRequest,
    admin: PlatformAdmin,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ShopifyConfigResponse:
    workspace = await session.get(Workspace, payload.workspace_id)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    if await session.scalar(
        select(ShopifyConfig.id).where(ShopifyConfig.workspace_id == workspace.id)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workspace already has a Shopify configuration",
        )
    config = ShopifyConfig(
        id=new_id(),
        workspace_id=workspace.id,
        store_url=_normalize_store_url(payload.store_url),
        api_version=payload.api_version,
        api_key_encrypted=encrypt_secret(payload.api_key, settings),
        api_secret_encrypted=encrypt_secret(payload.api_secret_key, settings),
        grant_type=payload.grant_type,
        is_active=False,
    )
    session.add(config)
    record_audit(
        session,
        workspace_id=workspace.id,
        actor_user_id=admin.id,
        action="shopify.config_created",
        entity_type="shopify_config",
        entity_id=config.id,
        payload={"store_url": config.store_url, "api_version": config.api_version},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Workspace already has a Shopify configuration",
        ) from exc
    return _format_config(workspace, config, settings)


async def _get_config(config_id: str, session: SessionDep) -> ShopifyConfig:
    config = await session.scalar(
        select(ShopifyConfig)
        .where(ShopifyConfig.id == config_id)
        .options(selectinload(ShopifyConfig.workspace))
    )
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shopify configuration not found",
        )
    return config


@router.patch("/{config_id}", response_model=ShopifyConfigResponse)
async def update_shopify_config(
    config_id: str,
    payload: ShopifyConfigUpdateRequest,
    admin: PlatformAdmin,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ShopifyConfigResponse:
    config = await _get_config(config_id, session)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No fields to update"
        )
    public_fields: list[str] = []
    for field_name, value in changes.items():
        if field_name == "api_key":
            config.api_key_encrypted = encrypt_secret(value, settings)
        elif field_name == "api_secret_key":
            config.api_secret_encrypted = encrypt_secret(value, settings)
        elif field_name == "store_url":
            config.store_url = _normalize_store_url(value)
        else:
            setattr(config, field_name, value)
        public_fields.append(field_name)
    clear_shopify_caches(config.workspace_id)
    record_audit(
        session,
        workspace_id=config.workspace_id,
        actor_user_id=admin.id,
        action="shopify.config_updated",
        entity_type="shopify_config",
        entity_id=config.id,
        payload={"fields": sorted(public_fields)},
    )
    await session.commit()
    return _format_config(config.workspace, config, settings)


@router.patch("/{config_id}/status", response_model=ShopifyConfigResponse)
async def update_shopify_config_status(
    config_id: str,
    payload: ShopifyConfigStatusRequest,
    admin: PlatformAdmin,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ShopifyConfigResponse:
    config = await _get_config(config_id, session)
    if payload.is_active:
        missing = []
        if not config.store_url:
            missing.append("store_url")
        if not config.api_key_encrypted:
            missing.append("api_key")
        if not config.api_secret_encrypted:
            missing.append("api_secret_key")
        if missing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "Shopify configuration is incomplete", "missing": missing},
            )
    config.is_active = payload.is_active
    clear_shopify_caches(config.workspace_id)
    record_audit(
        session,
        workspace_id=config.workspace_id,
        actor_user_id=admin.id,
        action="shopify.config_status_updated",
        entity_type="shopify_config",
        entity_id=config.id,
        payload={"is_active": config.is_active},
    )
    await session.commit()
    return _format_config(config.workspace, config, settings)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_shopify_config(
    config_id: str,
    admin: PlatformAdmin,
    session: SessionDep,
) -> None:
    config = await _get_config(config_id, session)
    if config.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Disable the Shopify configuration before deleting it",
        )
    record_audit(
        session,
        workspace_id=config.workspace_id,
        actor_user_id=admin.id,
        action="shopify.config_deleted",
        entity_type="shopify_config",
        entity_id=config.id,
        payload={"store_url": config.store_url},
    )
    clear_shopify_caches(config.workspace_id)
    await session.delete(config)
    await session.commit()


def _job_response(item: OutboxMessage) -> ShopifySyncJobResponse:
    return ShopifySyncJobResponse(
        id=item.id,
        workspace_id=item.workspace_id,
        operation=str(item.payload.get("operation") or "catalog"),
        product_ids=[str(value) for value in item.payload.get("product_ids") or []],
        status=item.status,
        attempts=item.attempts,
        available_at=item.available_at,
        processed_at=item.processed_at,
        last_error=item.last_error,
        created_at=item.created_at,
    )


@workspace_router.post(
    "/sync-jobs", response_model=ShopifySyncJobResponse, status_code=status.HTTP_201_CREATED
)
async def create_shopify_sync_job(
    payload: ShopifySyncRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> ShopifySyncJobResponse:
    config = await session.scalar(
        select(ShopifyConfig).where(ShopifyConfig.workspace_id == context.workspace.id)
    )
    if config is None or not config.is_ready:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active Shopify configuration is required",
        )
    if payload.product_ids:
        from app.core.models import Product

        found_ids = set(
            await session.scalars(
                select(Product.id).where(
                    Product.workspace_id == context.workspace.id,
                    Product.id.in_(payload.product_ids),
                )
            )
        )
        missing = sorted(set(payload.product_ids) - found_ids)
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "One or more products were not found", "ids": missing},
            )
    deduplication_key = f"shopify:{context.workspace.id}:{idempotency_key or new_id()}"
    existing = await session.scalar(
        select(OutboxMessage).where(OutboxMessage.deduplication_key == deduplication_key)
    )
    if existing is not None:
        return _job_response(existing)
    message = OutboxMessage(
        id=new_id(),
        workspace_id=context.workspace.id,
        topic="shopify.sync.requested",
        aggregate_type="workspace",
        aggregate_id=context.workspace.id,
        deduplication_key=deduplication_key,
        payload=payload.model_dump(mode="json"),
    )
    session.add(message)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="shopify.sync_requested",
        entity_type="outbox_message",
        entity_id=message.id,
        payload=message.payload,
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        replay = await session.scalar(
            select(OutboxMessage).where(OutboxMessage.deduplication_key == deduplication_key)
        )
        if replay is None:
            raise
        return _job_response(replay)
    return _job_response(message)


@workspace_router.get("/sync-jobs", response_model=list[ShopifySyncJobResponse])
async def list_shopify_sync_jobs(
    context: WorkspaceWriteDep,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[ShopifySyncJobResponse]:
    items = (
        await session.scalars(
            select(OutboxMessage)
            .where(
                OutboxMessage.workspace_id == context.workspace.id,
                OutboxMessage.topic == "shopify.sync.requested",
            )
            .order_by(OutboxMessage.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [_job_response(item) for item in items]
