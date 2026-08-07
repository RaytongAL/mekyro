from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import PlatformAdmin, SessionDep
from app.core.models import (
    ApiKey,
    BuyerInquiry,
    Category,
    ContactActivity,
    InventoryMovement,
    Lead,
    Product,
    ProductVariant,
    SupplierInquiry,
    Workspace,
)
from app.modules.catalog.router import (
    CategoryResponse,
    ProductResponse,
    VariantListItemResponse,
    VariantResponse,
    _category_descendants,
    _specification_filter_pairs,
)
from app.modules.crm.router import ActivityResponse, LeadResponse

router = APIRouter(prefix="/internal", tags=["platform"])


class InventoryPlatformResponse(BaseModel):
    id: str
    workspace_id: str
    variant_id: str
    sku_code: str
    product_name: str
    movement_type: str
    quantity_delta: int
    balance_after: int
    reason: str
    reference: str
    created_by: str
    created_at: datetime


class PlatformInventoryListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[InventoryPlatformResponse]


class PlatformLeadResponse(LeadResponse):
    workspace_id: str
    workspace_name: str = ""


class PlatformLeadListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[PlatformLeadResponse]


class PlatformActivityResponse(ActivityResponse):
    workspace_id: str


class PlatformActivityListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[PlatformActivityResponse]


class PlatformProductResponse(ProductResponse):
    workspace_id: str


class PlatformProductListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[PlatformProductResponse]


class PlatformCategoryResponse(CategoryResponse):
    workspace_name: str = ""


class PlatformCategoryListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[PlatformCategoryResponse]


class PlatformVariantResponse(VariantListItemResponse):
    workspace_id: str


class PlatformVariantListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[PlatformVariantResponse]


class PlatformDashboardResponse(BaseModel):
    workspace_count: int
    lead_count: int
    high_score_lead_count: int
    contact_log_count: int
    supplier_inquiry_count: int
    buyer_inquiry_count: int
    pending_inquiry_count: int
    product_count: int
    variant_count: int
    category_count: int
    inventory_movement_count: int
    active_api_key_count: int
    lead_stages: dict[str, int]
    contact_log_types: dict[str, int]
    inquiry_statuses: dict[str, int]
    latest_activity_time: str | None
    recent_leads: list[PlatformLeadResponse]


@router.get("/leads", response_model=PlatformLeadListResponse)
async def list_platform_leads(
    _admin: PlatformAdmin,
    session: SessionDep,
    search: str | None = None,
    workspace_id: str | None = None,
    country: str | None = None,
    stage: str | None = None,
    ordering: Literal[
        "id",
        "-id",
        "created_at",
        "-created_at",
        "recommendation_score",
        "-recommendation_score",
        "merchant_name",
        "-merchant_name",
    ] = "-id",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlatformLeadListResponse:
    filters = []
    if workspace_id:
        filters.append(Lead.workspace_id == workspace_id)
    if country:
        filters.append(Lead.country == country.upper())
    if stage:
        filters.append(Lead.stage == stage)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                Lead.merchant_name.ilike(term),
                Lead.company_name.ilike(term),
                Lead.contact_person.ilike(term),
                Lead.external_ref.ilike(term),
                Lead.email.ilike(term),
            )
        )
    ordering_map = {
        "id": Lead.created_at.asc(),
        "-id": Lead.created_at.desc(),
        "created_at": Lead.created_at.asc(),
        "-created_at": Lead.created_at.desc(),
        "recommendation_score": Lead.recommendation_score.asc(),
        "-recommendation_score": Lead.recommendation_score.desc(),
        "merchant_name": Lead.merchant_name.asc(),
        "-merchant_name": Lead.merchant_name.desc(),
    }
    total = await session.scalar(select(func.count()).select_from(Lead).where(*filters)) or 0
    latest_contact_at = (
        select(func.max(ContactActivity.created_at))
        .where(ContactActivity.lead_id == Lead.id)
        .correlate(Lead)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(Lead, Workspace.name, latest_contact_at.label("latest_contact_at"))
            .join(Workspace, Workspace.id == Lead.workspace_id)
            .where(*filters)
            .order_by(ordering_map[ordering], Lead.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return PlatformLeadListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            PlatformLeadResponse.model_validate(lead).model_copy(
                update={"workspace_name": workspace_name, "latest_contact_at": latest}
            )
            for lead, workspace_name, latest in rows
        ],
    )


@router.get("/leads/{lead_id}", response_model=PlatformLeadResponse)
async def get_platform_lead(
    lead_id: str,
    _admin: PlatformAdmin,
    session: SessionDep,
) -> PlatformLeadResponse:
    row = (
        await session.execute(
            select(Lead, Workspace.name)
            .join(Workspace, Workspace.id == Lead.workspace_id)
            .where(Lead.id == lead_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    lead, workspace_name = row
    latest = await session.scalar(
        select(func.max(ContactActivity.created_at)).where(ContactActivity.lead_id == lead.id)
    )
    return PlatformLeadResponse.model_validate(lead).model_copy(
        update={"workspace_name": workspace_name, "latest_contact_at": latest}
    )


@router.get("/contact-logs", response_model=PlatformActivityListResponse)
async def list_platform_contact_logs(
    _admin: PlatformAdmin,
    session: SessionDep,
    workspace_id: str | None = None,
    lead_id: str | None = None,
    activity_type: str | None = Query(default=None, alias="type"),
    channel: Literal["email", "whatsapp", "phone"] | None = None,
    search: str | None = None,
    ordering: Literal[
        "id",
        "-id",
        "created_at",
        "-created_at",
        "channel",
        "-channel",
        "type",
        "-type",
    ] = "-id",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlatformActivityListResponse:
    filters = []
    if workspace_id:
        filters.append(ContactActivity.workspace_id == workspace_id)
    if lead_id:
        filters.append(ContactActivity.lead_id == lead_id)
    if activity_type:
        filters.append(ContactActivity.activity_type == activity_type)
    if channel:
        filters.append(ContactActivity.channel == channel)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                ContactActivity.subject.ilike(term),
                ContactActivity.content.ilike(term),
                ContactActivity.sender.ilike(term),
                ContactActivity.recipient.ilike(term),
                ContactActivity.activity_type.ilike(term),
                ContactActivity.channel.ilike(term),
            )
        )
    ordering_map = {
        "id": ContactActivity.created_at.asc(),
        "-id": ContactActivity.created_at.desc(),
        "created_at": ContactActivity.created_at.asc(),
        "-created_at": ContactActivity.created_at.desc(),
        "channel": ContactActivity.channel.asc(),
        "-channel": ContactActivity.channel.desc(),
        "type": ContactActivity.activity_type.asc(),
        "-type": ContactActivity.activity_type.desc(),
    }
    total = (
        await session.scalar(select(func.count()).select_from(ContactActivity).where(*filters))
        or 0
    )
    rows = (
        await session.execute(
            select(ContactActivity, Lead.merchant_name)
            .join(Lead, Lead.id == ContactActivity.lead_id)
            .where(*filters)
            .order_by(ordering_map[ordering], ContactActivity.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return PlatformActivityListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            PlatformActivityResponse.model_validate(activity).model_copy(
                update={"merchant_name": merchant_name}
            )
            for activity, merchant_name in rows
        ],
    )


@router.get("/contact-logs/{activity_id}", response_model=PlatformActivityResponse)
async def get_platform_contact_log(
    activity_id: str,
    _admin: PlatformAdmin,
    session: SessionDep,
) -> PlatformActivityResponse:
    row = (
        await session.execute(
            select(ContactActivity, Lead.merchant_name)
            .join(Lead, Lead.id == ContactActivity.lead_id)
            .where(ContactActivity.id == activity_id)
        )
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Contact activity not found"
        )
    activity, merchant_name = row
    return PlatformActivityResponse.model_validate(activity).model_copy(
        update={"merchant_name": merchant_name}
    )


@router.get("/categories", response_model=PlatformCategoryListResponse)
async def list_platform_categories(
    _admin: PlatformAdmin,
    session: SessionDep,
    workspace_id: str | None = None,
    ordering: Literal[
        "id",
        "-id",
        "created_at",
        "-created_at",
        "sort_order",
        "-sort_order",
        "name",
        "-name",
    ] = "-id",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlatformCategoryListResponse:
    filters = [Category.workspace_id == workspace_id] if workspace_id else []
    ordering_map = {
        "id": Category.created_at.asc(),
        "-id": Category.created_at.desc(),
        "created_at": Category.created_at.asc(),
        "-created_at": Category.created_at.desc(),
        "sort_order": Category.sort_order.asc(),
        "-sort_order": Category.sort_order.desc(),
        "name": Category.name.asc(),
        "-name": Category.name.desc(),
    }
    total = await session.scalar(select(func.count()).select_from(Category).where(*filters)) or 0
    rows = (
        await session.execute(
            select(Category, Workspace.name)
            .join(Workspace, Workspace.id == Category.workspace_id)
            .where(*filters)
            .order_by(ordering_map[ordering], Category.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return PlatformCategoryListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            PlatformCategoryResponse.model_validate(category).model_copy(
                update={"workspace_name": workspace_name}
            )
            for category, workspace_name in rows
        ],
    )


@router.get("/specification-options", response_model=dict[str, list[str]])
async def list_platform_specification_options(
    _admin: PlatformAdmin,
    session: SessionDep,
    workspace_id: str | None = None,
) -> dict[str, list[str]]:
    product_filters = [Product.is_deleted.is_(False)]
    variant_filters = [ProductVariant.is_deleted.is_(False)]
    if workspace_id:
        product_filters.append(Product.workspace_id == workspace_id)
        variant_filters.append(ProductVariant.workspace_id == workspace_id)
    product_templates = (
        await session.scalars(
            select(Product.specification_template).where(*product_filters)
        )
    ).all()
    variant_specifications = (
        await session.scalars(
            select(ProductVariant.specifications).where(*variant_filters)
        )
    ).all()
    options: dict[str, set[str]] = {}
    for template in product_templates:
        for item in template or []:
            name = str(item.get("name", "")).strip()
            if name:
                options.setdefault(name, set()).update(
                    str(value) for value in item.get("options", []) if str(value).strip()
                )
    for specifications in variant_specifications:
        for name, value in (specifications or {}).items():
            if str(name).strip() and str(value).strip():
                options.setdefault(str(name), set()).add(str(value))
    return {name: sorted(values) for name, values in sorted(options.items())}


@router.get("/products", response_model=PlatformProductListResponse)
async def list_platform_products(
    _admin: PlatformAdmin,
    session: SessionDep,
    search: str | None = None,
    workspace_id: str | None = None,
    category_id: str | None = None,
    brand_id: str | None = None,
    brand_name: str | None = None,
    status_filter: Annotated[Literal["active", "inactive"] | None, Query(alias="status")] = None,
    stock: Literal["in_stock", "out_of_stock"] | None = None,
    ordering: Literal[
        "created_at", "-created_at", "updated_at", "-updated_at", "name", "-name"
    ] = "-created_at",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlatformProductListResponse:
    filters = [Product.is_deleted.is_(False)]
    if workspace_id:
        filters.append(Product.workspace_id == workspace_id)
    if category_id:
        filters.append(Product.category_id.in_(await _category_descendants(category_id, session)))
    if brand_id:
        filters.append(Product.category_id == brand_id)
    if brand_name:
        brand_filters = [
            Category.parent_id.is_not(None),
            func.lower(Category.name) == brand_name.strip().lower(),
        ]
        if workspace_id:
            brand_filters.append(Category.workspace_id == workspace_id)
        brand_ids = set(await session.scalars(select(Category.id).where(*brand_filters)))
        filters.append(Product.category_id.in_(brand_ids))
    if status_filter:
        filters.append(Product.status == status_filter)
    stocked_product_ids = select(ProductVariant.product_id).where(
        ProductVariant.is_deleted.is_(False),
        ProductVariant.stock_quantity > 0,
    )
    if stock == "in_stock":
        filters.append(Product.id.in_(stocked_product_ids))
    elif stock == "out_of_stock":
        filters.append(Product.id.not_in(stocked_product_ids))
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(Product.name.ilike(term), Product.description.ilike(term)))
    ordering_map = {
        "created_at": Product.created_at.asc(),
        "-created_at": Product.created_at.desc(),
        "updated_at": Product.updated_at.asc(),
        "-updated_at": Product.updated_at.desc(),
        "name": Product.name.asc(),
        "-name": Product.name.desc(),
    }
    total = await session.scalar(select(func.count()).select_from(Product).where(*filters)) or 0
    items = (
        await session.scalars(
            select(Product)
            .where(*filters)
            .options(
                selectinload(Product.variants).selectinload(ProductVariant.price_tiers),
                selectinload(Product.variants).selectinload(ProductVariant.images),
                selectinload(Product.images),
            )
            .order_by(ordering_map[ordering])
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return PlatformProductListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[PlatformProductResponse.model_validate(item) for item in items],
    )


@router.get("/products/trash", response_model=PlatformProductListResponse)
async def list_platform_deleted_products(
    _admin: PlatformAdmin,
    session: SessionDep,
    search: str | None = None,
    workspace_id: str | None = None,
    ordering: Literal["id", "-id", "deleted_at", "-deleted_at", "name", "-name"] = (
        "-deleted_at"
    ),
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlatformProductListResponse:
    filters = [Product.is_deleted.is_(True)]
    if workspace_id:
        filters.append(Product.workspace_id == workspace_id)
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(Product.name.ilike(term), Product.description.ilike(term)))
    ordering_map = {
        "id": Product.created_at.asc(),
        "-id": Product.created_at.desc(),
        "deleted_at": Product.deleted_at.asc(),
        "-deleted_at": Product.deleted_at.desc(),
        "name": Product.name.asc(),
        "-name": Product.name.desc(),
    }
    total = await session.scalar(select(func.count()).select_from(Product).where(*filters)) or 0
    items = (
        (
            await session.scalars(
                select(Product)
                .where(*filters)
                .options(
                    selectinload(Product.variants).selectinload(ProductVariant.price_tiers),
                    selectinload(Product.variants).selectinload(ProductVariant.images),
                    selectinload(Product.images),
                )
                .order_by(ordering_map[ordering], Product.id)
                .limit(limit)
                .offset(offset)
            )
        )
        .unique()
        .all()
    )
    return PlatformProductListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[PlatformProductResponse.model_validate(item) for item in items],
    )


@router.get("/products/{product_id}", response_model=PlatformProductResponse)
async def get_platform_product(
    product_id: str,
    _admin: PlatformAdmin,
    session: SessionDep,
) -> ProductResponse:
    product = await session.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(
            selectinload(Product.variants).selectinload(ProductVariant.price_tiers),
            selectinload(Product.variants).selectinload(ProductVariant.images),
            selectinload(Product.images),
        )
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return PlatformProductResponse.model_validate(product)


@router.get("/variants", response_model=PlatformVariantListResponse)
async def list_platform_variants(
    _admin: PlatformAdmin,
    session: SessionDep,
    search: str | None = None,
    workspace_id: str | None = None,
    category_id: str | None = None,
    brand_id: str | None = None,
    brand_name: str | None = None,
    product_id: str | None = None,
    status_filter: Annotated[Literal["active", "inactive"] | None, Query(alias="status")] = None,
    stock: Literal["in_stock", "out_of_stock"] | None = None,
    spec_key: str | None = None,
    spec_value: str | None = None,
    ordering: Literal[
        "created_at",
        "-created_at",
        "sku_code",
        "-sku_code",
        "stock_quantity",
        "-stock_quantity",
    ] = "-created_at",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlatformVariantListResponse:
    filters = [ProductVariant.is_deleted.is_(False), Product.is_deleted.is_(False)]
    if workspace_id:
        filters.append(ProductVariant.workspace_id == workspace_id)
    if category_id:
        filters.append(Product.category_id.in_(await _category_descendants(category_id, session)))
    if brand_id:
        filters.append(Product.category_id == brand_id)
    if brand_name:
        brand_filters = [
            Category.parent_id.is_not(None),
            func.lower(Category.name) == brand_name.strip().lower(),
        ]
        if workspace_id:
            brand_filters.append(Category.workspace_id == workspace_id)
        brand_ids = set(await session.scalars(select(Category.id).where(*brand_filters)))
        filters.append(Product.category_id.in_(brand_ids))
    if product_id:
        filters.append(Product.id == product_id)
    if status_filter:
        filters.append(ProductVariant.status == status_filter)
    if stock == "in_stock":
        filters.append(ProductVariant.stock_quantity > 0)
    elif stock == "out_of_stock":
        filters.append(ProductVariant.stock_quantity == 0)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                ProductVariant.sku_code.ilike(term),
                Product.name.ilike(term),
                cast(ProductVariant.specifications, String).ilike(term),
            )
        )
    filters.extend(
        ProductVariant.specifications[key].as_string() == value
        for key, value in _specification_filter_pairs(spec_key, spec_value)
    )
    ordering_map = {
        "created_at": ProductVariant.created_at.asc(),
        "-created_at": ProductVariant.created_at.desc(),
        "sku_code": ProductVariant.sku_code.asc(),
        "-sku_code": ProductVariant.sku_code.desc(),
        "stock_quantity": ProductVariant.stock_quantity.asc(),
        "-stock_quantity": ProductVariant.stock_quantity.desc(),
    }
    total = (
        await session.scalar(
            select(func.count())
            .select_from(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(*filters)
        )
        or 0
    )
    rows = (
        await session.execute(
            select(ProductVariant, Product.name, Product.category_id)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(*filters)
            .options(
                selectinload(ProductVariant.price_tiers),
                selectinload(ProductVariant.images),
            )
            .order_by(ordering_map[ordering])
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return PlatformVariantListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            PlatformVariantResponse(
                **VariantResponse.model_validate(variant).model_dump(),
                product_name=product_name,
                category_id=category_id_value,
            )
            for variant, product_name, category_id_value in rows
        ],
    )


@router.get("/variants/trash", response_model=PlatformVariantListResponse)
async def list_platform_deleted_variants(
    _admin: PlatformAdmin,
    session: SessionDep,
    search: str | None = None,
    workspace_id: str | None = None,
    ordering: Literal[
        "id", "-id", "deleted_at", "-deleted_at", "sku_code", "-sku_code"
    ] = "-deleted_at",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlatformVariantListResponse:
    filters = [ProductVariant.is_deleted.is_(True)]
    if workspace_id:
        filters.append(ProductVariant.workspace_id == workspace_id)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                ProductVariant.sku_code.ilike(term),
                Product.name.ilike(term),
                cast(ProductVariant.specifications, String).ilike(term),
            )
        )
    ordering_map = {
        "id": ProductVariant.created_at.asc(),
        "-id": ProductVariant.created_at.desc(),
        "deleted_at": ProductVariant.deleted_at.asc(),
        "-deleted_at": ProductVariant.deleted_at.desc(),
        "sku_code": ProductVariant.sku_code.asc(),
        "-sku_code": ProductVariant.sku_code.desc(),
    }
    total = (
        await session.scalar(
            select(func.count())
            .select_from(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(*filters)
        )
        or 0
    )
    rows = (
        await session.execute(
            select(ProductVariant, Product.name, Product.category_id)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(*filters)
            .options(
                selectinload(ProductVariant.price_tiers),
                selectinload(ProductVariant.images),
            )
            .order_by(ordering_map[ordering], ProductVariant.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return PlatformVariantListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            PlatformVariantResponse(
                **VariantResponse.model_validate(variant).model_dump(),
                product_name=product_name,
                category_id=category_id_value,
            )
            for variant, product_name, category_id_value in rows
        ],
    )


@router.get("/inventory-movements", response_model=PlatformInventoryListResponse)
async def list_platform_inventory_movements(
    _admin: PlatformAdmin,
    session: SessionDep,
    workspace_id: str | None = None,
    variant_id: str | None = None,
    movement_type: str | None = Query(default=None, alias="type"),
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
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    page: Annotated[int | None, Query(ge=1)] = None,
    page_size: Annotated[int | None, Query(ge=1, le=100)] = None,
) -> PlatformInventoryListResponse:
    if page is not None or page_size is not None:
        limit = page_size or limit
        offset = ((page or 1) - 1) * limit
    filters = []
    if workspace_id:
        filters.append(InventoryMovement.workspace_id == workspace_id)
    if variant_id:
        filters.append(InventoryMovement.variant_id == variant_id)
    if movement_type:
        filters.append(InventoryMovement.movement_type == movement_type)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                InventoryMovement.reason.ilike(term),
                InventoryMovement.reference.ilike(term),
                InventoryMovement.created_by.ilike(term),
                ProductVariant.sku_code.ilike(term),
                Product.name.ilike(term),
            )
        )
    ordering_map = {
        "id": InventoryMovement.created_at.asc(),
        "-id": InventoryMovement.created_at.desc(),
        "created_at": InventoryMovement.created_at.asc(),
        "-created_at": InventoryMovement.created_at.desc(),
        "quantity_delta": InventoryMovement.quantity_delta.asc(),
        "-quantity_delta": InventoryMovement.quantity_delta.desc(),
        "balance_after": InventoryMovement.balance_after.asc(),
        "-balance_after": InventoryMovement.balance_after.desc(),
        "sku_code": ProductVariant.sku_code.asc(),
        "-sku_code": ProductVariant.sku_code.desc(),
        "product_name": Product.name.asc(),
        "-product_name": Product.name.desc(),
    }
    base_query = (
        select(InventoryMovement)
        .join(ProductVariant, ProductVariant.id == InventoryMovement.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(*filters)
    )
    total = (
        await session.scalar(select(func.count()).select_from(base_query.subquery())) or 0
    )
    rows = (
        await session.execute(
            select(InventoryMovement, ProductVariant.sku_code, Product.name)
            .join(ProductVariant, ProductVariant.id == InventoryMovement.variant_id)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(*filters)
            .order_by(ordering_map[ordering], InventoryMovement.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return PlatformInventoryListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            InventoryPlatformResponse(
                id=movement.id,
                workspace_id=movement.workspace_id,
                variant_id=movement.variant_id,
                sku_code=sku_code,
                product_name=product_name,
                movement_type=movement.movement_type,
                quantity_delta=movement.quantity_delta,
                balance_after=movement.balance_after,
                reason=movement.reason,
                reference=movement.reference,
                created_by=movement.created_by,
                created_at=movement.created_at,
            )
            for movement, sku_code, product_name in rows
        ],
    )


@router.get("/dashboard/stats", response_model=PlatformDashboardResponse)
async def platform_dashboard_stats(
    _admin: PlatformAdmin,
    session: SessionDep,
) -> PlatformDashboardResponse:
    workspace_count = await session.scalar(
        select(func.count()).select_from(Workspace).where(Workspace.is_active.is_(True))
    ) or 0
    lead_count = await session.scalar(select(func.count()).select_from(Lead)) or 0
    high_score = await session.scalar(
        select(func.count()).select_from(Lead).where(Lead.recommendation_score >= 80)
    ) or 0
    contact_count = await session.scalar(select(func.count()).select_from(ContactActivity)) or 0
    supplier_count = await session.scalar(select(func.count()).select_from(SupplierInquiry)) or 0
    buyer_count = await session.scalar(select(func.count()).select_from(BuyerInquiry)) or 0
    pending_supplier = await session.scalar(
        select(func.count()).select_from(SupplierInquiry).where(SupplierInquiry.status == "pending")
    ) or 0
    pending_buyer = await session.scalar(
        select(func.count()).select_from(BuyerInquiry).where(BuyerInquiry.status == "pending")
    ) or 0
    product_count = await session.scalar(
        select(func.count()).select_from(Product).where(Product.is_deleted.is_(False))
    ) or 0
    variant_count = await session.scalar(
        select(func.count()).select_from(ProductVariant).where(ProductVariant.is_deleted.is_(False))
    ) or 0
    category_count = await session.scalar(select(func.count()).select_from(Category)) or 0
    movement_count = await session.scalar(select(func.count()).select_from(InventoryMovement)) or 0
    active_api_key_count = await session.scalar(
        select(func.count()).select_from(ApiKey).where(ApiKey.is_active.is_(True))
    ) or 0

    stage_rows = await session.execute(
        select(Lead.stage, func.count()).group_by(Lead.stage)
    )
    lead_stages = {str(stage): count for stage, count in stage_rows.all()}
    activity_type_rows = await session.execute(
        select(ContactActivity.activity_type, func.count()).group_by(ContactActivity.activity_type)
    )
    contact_log_types = {
        str(activity_type): count for activity_type, count in activity_type_rows.all()
    }
    inquiry_status_rows = []
    for model in (SupplierInquiry, BuyerInquiry):
        inquiry_status_rows.extend(
            (str(item), count)
            for item, count in (
                await session.execute(select(model.status, func.count()).group_by(model.status))
            ).all()
        )
    inquiry_statuses: dict[str, int] = {}
    for inquiry_status, count in inquiry_status_rows:
        inquiry_statuses[inquiry_status] = inquiry_statuses.get(inquiry_status, 0) + count
    latest_values: list[datetime] = []
    for model in (Lead, ContactActivity, SupplierInquiry, BuyerInquiry, InventoryMovement):
        latest = await session.scalar(select(func.max(model.created_at)))
        if latest is not None:
            latest_values.append(latest)
    latest_contact_at = (
        select(func.max(ContactActivity.created_at))
        .where(ContactActivity.lead_id == Lead.id)
        .correlate(Lead)
        .scalar_subquery()
    )
    recent_rows = (
        await session.execute(
            select(Lead, Workspace.name, latest_contact_at.label("latest_contact_at"))
            .join(Workspace, Workspace.id == Lead.workspace_id)
            .order_by(Lead.created_at.desc())
            .limit(5)
        )
    ).all()
    return PlatformDashboardResponse(
        workspace_count=workspace_count,
        lead_count=lead_count,
        high_score_lead_count=high_score,
        contact_log_count=contact_count,
        supplier_inquiry_count=supplier_count,
        buyer_inquiry_count=buyer_count,
        pending_inquiry_count=pending_supplier + pending_buyer,
        product_count=product_count,
        variant_count=variant_count,
        category_count=category_count,
        inventory_movement_count=movement_count,
        active_api_key_count=active_api_key_count,
        lead_stages=lead_stages,
        contact_log_types=contact_log_types,
        inquiry_statuses=inquiry_statuses,
        latest_activity_time=max(latest_values).isoformat() if latest_values else None,
        recent_leads=[
            PlatformLeadResponse.model_validate(lead).model_copy(
                update={"workspace_name": workspace_name, "latest_contact_at": latest}
            )
            for lead, workspace_name, latest in recent_rows
        ],
    )
