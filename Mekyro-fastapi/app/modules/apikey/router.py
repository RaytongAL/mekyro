"""API key lifecycle management and tenant-scoped external APIs."""

import hashlib
import secrets
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.audit import record_audit
from app.core.dependencies import (
    ApiKeyContext,
    PlatformAdmin,
    SessionDep,
    WorkspaceContext,
    api_key_permission,
)
from app.core.models import ApiKey, ContactActivity, Lead, Workspace, new_id
from app.modules.catalog.router import (
    CategoryCreateRequest,
    CategoryResponse,
    CategoryUpdateRequest,
    InventoryAdjustmentRequest,
    InventoryAdjustmentResponse,
    InventoryBatchItem,
    InventoryBatchResponse,
    InventoryMovementListResponse,
    PriceTierBatchItem,
    PriceTierBatchResponse,
    PriceTierResponse,
    PriceTierWrite,
    ProductCreateRequest,
    ProductListResponse,
    ProductResponse,
    ProductUpdateRequest,
    VariantBatchUpdateItem,
    VariantCreateRequest,
    VariantListItemResponse,
    VariantResponse,
    VariantUpdateRequest,
)
from app.modules.catalog.router import (
    adjust_inventory as _adjust_inventory,
)
from app.modules.catalog.router import (
    batch_adjust_inventory as _batch_adjust_inventory,
)
from app.modules.catalog.router import (
    batch_replace_price_tiers as _batch_replace_price_tiers,
)
from app.modules.catalog.router import (
    batch_update_variants as _batch_update_variants,
)
from app.modules.catalog.router import (
    create_category as _create_category,
)
from app.modules.catalog.router import (
    create_product as _create_product,
)
from app.modules.catalog.router import (
    create_variant as _create_variant,
)
from app.modules.catalog.router import (
    delete_category as _delete_category,
)
from app.modules.catalog.router import (
    delete_product as _delete_product,
)
from app.modules.catalog.router import (
    delete_variant as _delete_variant,
)
from app.modules.catalog.router import (
    get_category as _get_category_endpoint,
)
from app.modules.catalog.router import (
    get_product as _get_product_endpoint,
)
from app.modules.catalog.router import (
    get_variant as _get_variant_endpoint,
)
from app.modules.catalog.router import (
    list_categories as _list_categories,
)
from app.modules.catalog.router import (
    list_inventory_movements as _list_inventory_movements,
)
from app.modules.catalog.router import (
    list_products as _list_products,
)
from app.modules.catalog.router import (
    list_variants as _list_variants,
)
from app.modules.catalog.router import (
    replace_price_tiers as _replace_price_tiers,
)
from app.modules.catalog.router import (
    update_category as _update_category,
)
from app.modules.catalog.router import (
    update_product as _update_product,
)
from app.modules.catalog.router import (
    update_variant as _update_variant,
)
from app.modules.crm.router import (
    ActivityBatchCreateRequest,
    ActivityCreateRequest,
    ActivityListResponse,
    ActivityResponse,
    ActivityUpdateRequest,
    LeadBatchCreateRequest,
    LeadCreateRequest,
    LeadListResponse,
    LeadResponse,
    LeadSource,
    LeadUpdateRequest,
    _activity_response,
)
from app.modules.crm.router import (
    batch_create_activities as _batch_create_activities,
)
from app.modules.crm.router import (
    batch_create_leads as _batch_create_leads,
)
from app.modules.crm.router import (
    create_activity as _create_activity,
)
from app.modules.crm.router import (
    create_lead as _create_lead,
)
from app.modules.crm.router import (
    delete_activity as _delete_activity,
)
from app.modules.crm.router import (
    delete_lead as _delete_lead,
)
from app.modules.crm.router import (
    get_activity as _get_activity,
)
from app.modules.crm.router import (
    get_lead as _get_lead_endpoint,
)
from app.modules.crm.router import (
    list_leads as _list_leads,
)
from app.modules.crm.router import (
    update_activity as _update_activity,
)
from app.modules.crm.router import (
    update_lead as _update_lead,
)

router = APIRouter(prefix="/internal/api-keys", tags=["api-keys"])
external_router = APIRouter(prefix="/external", tags=["external-api"])


def _resolve_legacy_pagination(
    *,
    limit: int,
    offset: int,
    page: int | None,
    page_size: int | None,
) -> tuple[int, int]:
    if page is None and page_size is None:
        return limit, offset
    resolved_limit = page_size or limit
    return resolved_limit, ((page or 1) - 1) * resolved_limit


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    permissions: list[str] = Field(default_factory=list, max_length=100)
    workspace_id: str = Field(min_length=1, max_length=36)


class ApiKeyUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    permissions: list[str] | None = Field(default=None, max_length=100)
    workspace_id: str | None = Field(default=None, min_length=1, max_length=36)


class ApiKeyStatusRequest(BaseModel):
    is_active: bool


class ApiKeyItemResponse(BaseModel):
    id: str
    user_id: str
    username: str
    workspace_id: str
    workspace_name: str
    name: str
    key_prefix: str
    permissions: list[str]
    is_active: bool
    last_used_at: datetime | None
    created_at: datetime


class ApiKeyListResponse(BaseModel):
    keys: list[ApiKeyItemResponse]
    total: int
    page: int
    page_size: int


class ApiKeyCreatedResponse(BaseModel):
    id: str
    name: str
    key: str
    key_prefix: str
    permissions: list[str]
    workspace_id: str
    created_at: datetime


class ExternalWorkspacePromptResponse(BaseModel):
    workspace_id: str
    workspace_name: str
    prompt: str
    daily_lead_limit: int


def _format_key(item: ApiKey) -> ApiKeyItemResponse:
    return ApiKeyItemResponse(
        id=item.id,
        user_id=item.user_id,
        username=item.user.username,
        workspace_id=item.workspace_id,
        workspace_name=item.workspace.name,
        name=item.name,
        key_prefix=item.key_prefix,
        permissions=list(item.permissions or []),
        is_active=item.is_active,
        last_used_at=item.last_used_at,
        created_at=item.created_at,
    )


@router.get("", response_model=ApiKeyListResponse)
async def list_api_keys(
    admin: PlatformAdmin,
    session: SessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ApiKeyListResponse:
    del admin
    total = await session.scalar(select(func.count()).select_from(ApiKey)) or 0
    items = (
        await session.scalars(
            select(ApiKey)
            .options(selectinload(ApiKey.user), selectinload(ApiKey.workspace))
            .order_by(ApiKey.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
    ).all()
    return ApiKeyListResponse(
        keys=[_format_key(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=ApiKeyCreatedResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: ApiKeyCreateRequest,
    admin: PlatformAdmin,
    session: SessionDep,
) -> ApiKeyCreatedResponse:
    workspace = await session.get(Workspace, payload.workspace_id)
    if workspace is None or not workspace.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    raw_key = "mek_" + secrets.token_urlsafe(32)
    item = ApiKey(
        id=new_id(),
        user_id=admin.id,
        workspace_id=workspace.id,
        name=payload.name.strip(),
        key_hash=hashlib.sha256(raw_key.encode("utf-8")).hexdigest(),
        key_prefix=raw_key[:8],
        permissions=list(dict.fromkeys(permission.strip() for permission in payload.permissions)),
        is_active=True,
    )
    session.add(item)
    record_audit(
        session,
        workspace_id=workspace.id,
        actor_user_id=admin.id,
        action="api_key.created",
        entity_type="api_key",
        entity_id=item.id,
        payload={"name": item.name, "permissions": item.permissions, "key_prefix": item.key_prefix},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="API key already exists"
        ) from exc
    return ApiKeyCreatedResponse(
        id=item.id,
        name=item.name,
        key=raw_key,
        key_prefix=item.key_prefix,
        permissions=list(item.permissions or []),
        workspace_id=item.workspace_id,
        created_at=item.created_at,
    )


async def _get_api_key(api_key_id: str, session: SessionDep) -> ApiKey:
    item = await session.scalar(
        select(ApiKey)
        .where(ApiKey.id == api_key_id)
        .options(selectinload(ApiKey.user), selectinload(ApiKey.workspace))
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    return item


@router.patch("/{api_key_id}/status", response_model=ApiKeyItemResponse)
async def update_api_key_status(
    api_key_id: str,
    payload: ApiKeyStatusRequest,
    admin: PlatformAdmin,
    session: SessionDep,
) -> ApiKeyItemResponse:
    item = await _get_api_key(api_key_id, session)
    item.is_active = payload.is_active
    record_audit(
        session,
        workspace_id=item.workspace_id,
        actor_user_id=admin.id,
        action="api_key.status_updated",
        entity_type="api_key",
        entity_id=item.id,
        payload={"is_active": item.is_active},
    )
    await session.commit()
    return _format_key(item)


@router.patch("/{api_key_id}", response_model=ApiKeyItemResponse)
async def update_api_key(
    api_key_id: str,
    payload: ApiKeyUpdateRequest,
    admin: PlatformAdmin,
    session: SessionDep,
) -> ApiKeyItemResponse:
    item = await _get_api_key(api_key_id, session)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No fields to update"
        )
    if "name" in changes:
        changes["name"] = changes["name"].strip()
    if "permissions" in changes:
        changes["permissions"] = list(dict.fromkeys(changes["permissions"]))
    if "workspace_id" in changes:
        workspace = await session.get(Workspace, changes["workspace_id"])
        if workspace is None or not workspace.is_active:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    for field_name, value in changes.items():
        setattr(item, field_name, value)
    record_audit(
        session,
        workspace_id=item.workspace_id,
        actor_user_id=admin.id,
        action="api_key.updated",
        entity_type="api_key",
        entity_id=item.id,
        payload={"fields": sorted(changes)},
    )
    await session.commit()
    return _format_key(item)


@router.delete("/{api_key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    api_key_id: str,
    admin: PlatformAdmin,
    session: SessionDep,
) -> None:
    item = await _get_api_key(api_key_id, session)
    if item.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Disable the API key before revoking it",
        )
    record_audit(
        session,
        workspace_id=item.workspace_id,
        actor_user_id=admin.id,
        action="api_key.revoked",
        entity_type="api_key",
        entity_id=item.id,
        payload={"key_prefix": item.key_prefix},
    )
    await session.delete(item)
    await session.commit()


def _workspace_context(api_context: ApiKeyContext) -> WorkspaceContext:
    return WorkspaceContext(workspace=api_context.workspace, user=api_context.user, role="api_key")


ApiKeyWorkspaceRead = api_key_permission("workspace:read")


@external_router.get("/workspace/prompt", response_model=ExternalWorkspacePromptResponse)
async def external_get_workspace_prompt(
    context: ApiKeyWorkspaceRead,
) -> ExternalWorkspacePromptResponse:
    return ExternalWorkspacePromptResponse(
        workspace_id=context.workspace.id,
        workspace_name=context.workspace.name,
        prompt=context.workspace.prompt,
        daily_lead_limit=context.workspace.daily_lead_limit,
    )


# Django's external lead endpoints are exposed without a workspace path. The
# API key is the only source of tenant scope for every operation below.
ApiKeyLeadRead = api_key_permission("lead:read")
ApiKeyLeadCreate = api_key_permission("lead:create")
ApiKeyLeadUpdate = api_key_permission("lead:update")
ApiKeyLeadDelete = api_key_permission("lead:delete")
ApiKeyActivityRead = api_key_permission("lead_contact_log:read")
ApiKeyActivityCreate = api_key_permission("lead_contact_log:create")
ApiKeyActivityUpdate = api_key_permission("lead_contact_log:update")
ApiKeyActivityDelete = api_key_permission("lead_contact_log:delete")


@external_router.get("/leads", response_model=LeadListResponse)
async def external_list_leads(
    context: ApiKeyLeadRead,
    session: SessionDep,
    search: str | None = None,
    stage: str | None = None,
    country: str | None = None,
    source: LeadSource | None = None,
    platform: LeadSource | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    page: Annotated[int | None, Query(ge=1)] = None,
    page_size: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> LeadListResponse:
    if source and platform and source != platform:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="source and platform must match when both are provided",
        )
    limit, offset = _resolve_legacy_pagination(
        limit=limit,
        offset=offset,
        page=page,
        page_size=page_size,
    )
    return await _list_leads(
        context=_workspace_context(context),
        session=session,
        search=search,
        stage=stage,
        country=country,
        source_filter=source or platform,
        ordering="-id",
        limit=limit,
        offset=offset,
    )


@external_router.post("/leads", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def external_create_lead(
    payload: LeadCreateRequest,
    context: ApiKeyLeadCreate,
    session: SessionDep,
) -> LeadResponse:
    return await _create_lead(payload, _workspace_context(context), session)


@external_router.post(
    "/leads/batch", response_model=list[LeadResponse], status_code=status.HTTP_201_CREATED
)
async def external_batch_create_leads(
    payload: LeadBatchCreateRequest,
    context: ApiKeyLeadCreate,
    session: SessionDep,
) -> list[LeadResponse]:
    return await _batch_create_leads(payload, _workspace_context(context), session)


@external_router.get("/leads/{lead_id}", response_model=LeadResponse)
async def external_get_lead(
    lead_id: str,
    context: ApiKeyLeadRead,
    session: SessionDep,
) -> LeadResponse:
    return await _get_lead_endpoint(lead_id, _workspace_context(context), session)


@external_router.patch("/leads/{lead_id}", response_model=LeadResponse)
async def external_update_lead(
    lead_id: str,
    payload: LeadUpdateRequest,
    context: ApiKeyLeadUpdate,
    session: SessionDep,
) -> LeadResponse:
    return await _update_lead(lead_id, payload, _workspace_context(context), session)


@external_router.delete("/leads/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def external_delete_lead(
    lead_id: str,
    context: ApiKeyLeadDelete,
    session: SessionDep,
) -> None:
    await _delete_lead(lead_id, _workspace_context(context), session)


@external_router.get("/leads/{lead_id}/contact-logs", response_model=ActivityListResponse)
async def external_list_contact_logs(
    lead_id: str,
    context: ApiKeyActivityRead,
    session: SessionDep,
    activity_type: str | None = Query(default=None, alias="type"),
    channel: str | None = None,
    search: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    page: Annotated[int | None, Query(ge=1)] = None,
    page_size: Annotated[int | None, Query(ge=1, le=200)] = None,
) -> ActivityListResponse:
    workspace_context = _workspace_context(context)
    lead = await session.scalar(
        select(Lead).where(
            Lead.id == lead_id,
            Lead.workspace_id == workspace_context.workspace.id,
        )
    )
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    limit, offset = _resolve_legacy_pagination(
        limit=limit,
        offset=offset,
        page=page,
        page_size=page_size,
    )
    filters = [
        ContactActivity.workspace_id == workspace_context.workspace.id,
        ContactActivity.lead_id == lead_id,
    ]
    if activity_type:
        filters.append(ContactActivity.activity_type == activity_type)
    if channel:
        filters.append(ContactActivity.channel == channel)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                ContactActivity.subject.ilike(term),
                ContactActivity.sender.ilike(term),
                ContactActivity.recipient.ilike(term),
                ContactActivity.content.ilike(term),
            )
        )
    total = await session.scalar(
        select(func.count()).select_from(ContactActivity).where(*filters)
    ) or 0
    rows = (
        await session.execute(
            select(ContactActivity, Lead.merchant_name)
            .join(Lead, Lead.id == ContactActivity.lead_id)
            .where(*filters)
            .order_by(ContactActivity.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return ActivityListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            ActivityResponse.model_validate(activity).model_copy(
                update={"merchant_name": merchant_name}
            )
            for activity, merchant_name in rows
        ],
    )


@external_router.post(
    "/leads/{lead_id}/contact-logs",
    response_model=ActivityResponse,
    status_code=status.HTTP_201_CREATED,
)
async def external_create_contact_log(
    lead_id: str,
    payload: ActivityCreateRequest,
    context: ApiKeyActivityCreate,
    session: SessionDep,
) -> ActivityResponse:
    return await _create_activity(lead_id, payload, _workspace_context(context), session)


@external_router.post(
    "/leads/{lead_id}/contact-logs/batch",
    response_model=list[ActivityResponse],
    status_code=status.HTTP_201_CREATED,
)
async def external_batch_create_contact_logs(
    lead_id: str,
    payload: ActivityBatchCreateRequest,
    context: ApiKeyActivityCreate,
    session: SessionDep,
) -> list[ActivityResponse]:
    return await _batch_create_activities(lead_id, payload, _workspace_context(context), session)


@external_router.get("/contact-logs/{activity_id}", response_model=ActivityResponse)
async def external_get_contact_log(
    activity_id: str,
    context: ApiKeyActivityRead,
    session: SessionDep,
) -> ActivityResponse:
    activity = await _get_activity(activity_id, _workspace_context(context), session)
    return await _activity_response(activity, session)


@external_router.patch("/contact-logs/{activity_id}", response_model=ActivityResponse)
async def external_update_contact_log(
    activity_id: str,
    payload: ActivityUpdateRequest,
    context: ApiKeyActivityUpdate,
    session: SessionDep,
) -> ActivityResponse:
    return await _update_activity(activity_id, payload, _workspace_context(context), session)


@external_router.delete("/contact-logs/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def external_delete_contact_log(
    activity_id: str,
    context: ApiKeyActivityDelete,
    session: SessionDep,
) -> None:
    await _delete_activity(activity_id, _workspace_context(context), session)


# Catalog operations use the same audited command handlers as the bearer API.
ApiKeyProductRead = api_key_permission("product:read")
ApiKeyProductCreate = api_key_permission("product:create")
ApiKeyProductUpdate = api_key_permission("product:update")
ApiKeyProductDelete = api_key_permission("product:delete")
ApiKeyInventoryRead = api_key_permission("product_inventory:read")
ApiKeyInventoryCreate = api_key_permission("product_inventory:create")


@external_router.get("/categories", response_model=list[CategoryResponse])
async def external_list_categories(context: ApiKeyProductRead, session: SessionDep):
    return await _list_categories(_workspace_context(context), session)


@external_router.post(
    "/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED
)
async def external_create_category(
    payload: CategoryCreateRequest, context: ApiKeyProductCreate, session: SessionDep
):
    return await _create_category(payload, _workspace_context(context), session)


@external_router.get("/categories/{category_id}", response_model=CategoryResponse)
async def external_get_category(category_id: str, context: ApiKeyProductRead, session: SessionDep):
    return await _get_category_endpoint(category_id, _workspace_context(context), session)


@external_router.patch("/categories/{category_id}", response_model=CategoryResponse)
async def external_update_category(
    category_id: str,
    payload: CategoryUpdateRequest,
    context: ApiKeyProductUpdate,
    session: SessionDep,
):
    return await _update_category(category_id, payload, _workspace_context(context), session)


@external_router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def external_delete_category(
    category_id: str, context: ApiKeyProductDelete, session: SessionDep
):
    await _delete_category(category_id, _workspace_context(context), session)


@external_router.get("/products", response_model=ProductListResponse)
async def external_list_products(
    context: ApiKeyProductRead,
    session: SessionDep,
    search: str | None = None,
    category_id: str | None = None,
    brand_id: str | None = None,
    brand_name: str | None = None,
    status_filter: Annotated[
        Literal["active", "inactive"] | None,
        Query(alias="status"),
    ] = None,
    # Keep the legacy page contract available to integrations while the
    # canonical FastAPI contract uses limit/offset.
    include_skus: bool = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    page: Annotated[int | None, Query(ge=1)] = None,
    page_size: Annotated[int | None, Query(ge=1, le=100)] = None,
):
    del include_skus  # ProductResponse already includes non-deleted variants.
    limit, offset = _resolve_legacy_pagination(
        limit=limit,
        offset=offset,
        page=page,
        page_size=page_size,
    )
    return await _list_products(
        _workspace_context(context),
        session,
        search=search,
        status_filter=status_filter,
        category_id=category_id,
        brand_id=brand_id,
        brand_name=brand_name,
        stock=None,
        ordering="-created_at",
        limit=limit,
        offset=offset,
    )


@external_router.post(
    "/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED
)
async def external_create_product(
    payload: ProductCreateRequest, context: ApiKeyProductCreate, session: SessionDep
):
    return await _create_product(payload, _workspace_context(context), session)


@external_router.get("/products/{product_id}", response_model=ProductResponse)
async def external_get_product(product_id: str, context: ApiKeyProductRead, session: SessionDep):
    return await _get_product_endpoint(product_id, _workspace_context(context), session)


@external_router.patch("/products/{product_id}", response_model=ProductResponse)
async def external_update_product(
    product_id: str,
    payload: ProductUpdateRequest,
    context: ApiKeyProductUpdate,
    session: SessionDep,
):
    return await _update_product(product_id, payload, _workspace_context(context), session)


@external_router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def external_delete_product(
    product_id: str, context: ApiKeyProductDelete, session: SessionDep
):
    await _delete_product(product_id, _workspace_context(context), session)


@external_router.post(
    "/products/{product_id}/variants",
    response_model=VariantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def external_create_variant(
    product_id: str,
    payload: VariantCreateRequest,
    context: ApiKeyProductCreate,
    session: SessionDep,
):
    return await _create_variant(product_id, payload, _workspace_context(context), session)


@external_router.get("/variants", response_model=list[VariantListItemResponse])
async def external_list_variants(
    context: ApiKeyProductRead,
    session: SessionDep,
    search: str | None = None,
    status_filter: Annotated[
        Literal["active", "inactive"] | None,
        Query(alias="status"),
    ] = None,
    stock: Literal["in_stock", "out_of_stock"] | None = None,
    category_id: str | None = None,
    brand_id: str | None = None,
    brand_name: str | None = None,
    product_id: str | None = None,
    spec_key: str | None = None,
    spec_value: str | None = None,
    ordering: Literal[
        "created_at",
        "-created_at",
        "sku_code",
        "-sku_code",
        "stock_quantity",
        "-stock_quantity",
    ] = "created_at",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    page: Annotated[int | None, Query(ge=1)] = None,
    page_size: Annotated[int | None, Query(ge=1, le=100)] = None,
):
    limit, offset = _resolve_legacy_pagination(
        limit=limit,
        offset=offset,
        page=page,
        page_size=page_size,
    )
    return await _list_variants(
        _workspace_context(context),
        session,
        search=search,
        status_filter=status_filter,
        stock=stock,
        category_id=category_id,
        brand_id=brand_id,
        brand_name=brand_name,
        product_id=product_id,
        spec_key=spec_key,
        spec_value=spec_value,
        ordering=ordering,
        limit=limit,
        offset=offset,
    )


@external_router.get("/variants/{variant_id}", response_model=VariantResponse)
async def external_get_variant(variant_id: str, context: ApiKeyProductRead, session: SessionDep):
    return await _get_variant_endpoint(variant_id, _workspace_context(context), session)


@external_router.patch("/variants/{variant_id}", response_model=VariantResponse)
async def external_update_variant(
    variant_id: str,
    payload: VariantUpdateRequest,
    context: ApiKeyProductUpdate,
    session: SessionDep,
):
    return await _update_variant(variant_id, payload, _workspace_context(context), session)


@external_router.delete("/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def external_delete_variant(
    variant_id: str, context: ApiKeyProductDelete, session: SessionDep
):
    await _delete_variant(variant_id, _workspace_context(context), session)


@external_router.put("/variants/{variant_id}/price-tiers", response_model=list[PriceTierResponse])
async def external_replace_price_tiers(
    variant_id: str,
    payload: list[PriceTierWrite],
    context: ApiKeyProductUpdate,
    session: SessionDep,
):
    return await _replace_price_tiers(variant_id, payload, _workspace_context(context), session)


@external_router.patch("/batch/variants", response_model=list[VariantResponse])
async def external_batch_update_variants(
    payload: Annotated[list[VariantBatchUpdateItem], Field(min_length=1, max_length=500)],
    context: ApiKeyProductUpdate,
    session: SessionDep,
):
    return await _batch_update_variants(payload, _workspace_context(context), session)


@external_router.put("/batch/price-tiers", response_model=list[PriceTierBatchResponse])
async def external_batch_replace_price_tiers(
    payload: Annotated[list[PriceTierBatchItem], Field(min_length=1, max_length=500)],
    context: ApiKeyProductUpdate,
    session: SessionDep,
):
    return await _batch_replace_price_tiers(payload, _workspace_context(context), session)


@external_router.get("/inventory-movements", response_model=InventoryMovementListResponse)
async def external_list_inventory_movements(
    context: ApiKeyInventoryRead,
    session: SessionDep,
    variant_id: str | None = None,
    movement_type: Annotated[
        Literal["inbound", "outbound", "adjustment"] | None,
        Query(alias="type"),
    ] = None,
    search: str | None = None,
    ordering: Literal[
        "id",
        "-id",
        "created_at",
        "-created_at",
        "quantity_delta",
        "-quantity_delta",
        "balance_after",
        "-balance_after",
        "sku_code",
        "-sku_code",
        "product_name",
        "-product_name",
    ] = "-created_at",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    page: Annotated[int | None, Query(ge=1)] = None,
    page_size: Annotated[int | None, Query(ge=1, le=100)] = None,
):
    limit, offset = _resolve_legacy_pagination(
        limit=limit,
        offset=offset,
        page=page,
        page_size=page_size,
    )
    return await _list_inventory_movements(
        _workspace_context(context),
        session,
        variant_id=variant_id,
        movement_type=movement_type,
        search=search,
        ordering=ordering,
        limit=limit,
        offset=offset,
    )


@external_router.post(
    "/inventory-adjustments",
    response_model=InventoryAdjustmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def external_adjust_inventory(
    payload: InventoryAdjustmentRequest,
    context: ApiKeyInventoryCreate,
    session: SessionDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
):
    return await _adjust_inventory(
        payload,
        _workspace_context(context),
        session,
        idempotency_key=idempotency_key or f"api-{new_id()}",
    )


@external_router.post(
    "/batch/inventory-adjustments",
    response_model=InventoryBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def external_batch_adjust_inventory(
    payload: Annotated[list[InventoryBatchItem], Field(min_length=1, max_length=500)],
    context: ApiKeyInventoryCreate,
    session: SessionDep,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
):
    return await _batch_adjust_inventory(
        payload,
        _workspace_context(context),
        session,
        idempotency_key=idempotency_key or f"api-{new_id()}",
    )
