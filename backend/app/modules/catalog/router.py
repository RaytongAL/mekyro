import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, File, Header, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import String, cast, delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload, with_loader_criteria

from app.core.audit import record_audit
from app.core.dependencies import SessionDep, WorkspaceDep, WorkspaceWriteDep
from app.core.models import (
    Category,
    IdempotencyRecord,
    InventoryMovement,
    OrderItem,
    PriceTier,
    Product,
    ProductImage,
    ProductVariant,
    new_id,
)
from app.core.storage import save_upload
from app.modules.catalog.sync_outbox import enqueue_catalog_sync_if_configured

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["catalog"])


class PriceTierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    minimum_quantity: int
    unit_price: Decimal


class ProductImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    image_type: str
    url: str = Field(validation_alias="file_key")
    product_id: str | None
    variant_id: str | None
    created_at: datetime


class VariantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    product_id: str
    sku_code: str
    specifications: dict
    minimum_order_quantity: int
    currency: str
    stock_quantity: int
    status: str
    price_tiers: list[PriceTierResponse] = Field(default_factory=list)
    images: list[ProductImageResponse] = Field(default_factory=list)
    is_deleted: bool
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class VariantListItemResponse(VariantResponse):
    product_name: str
    category_id: str | None


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    category_id: str | None
    name: str
    description: str
    specification_template: list
    status: str
    variants: list[VariantResponse] = Field(default_factory=list)
    images: list[ProductImageResponse] = Field(default_factory=list)
    is_deleted: bool
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime
    sku_count: int | None = None
    total_stock: int | None = None

    @model_validator(mode="after")
    def populate_catalog_aggregates(self) -> "ProductResponse":
        if self.sku_count is None:
            self.sku_count = len(self.variants)
        if self.total_stock is None:
            self.total_stock = sum(item.stock_quantity for item in self.variants)
        return self


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    parent_id: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class CategoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    parent_id: str | None = Field(default=None, max_length=36)
    sort_order: int = Field(default=0, ge=-1_000_000, le=1_000_000)


class CategoryUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    parent_id: str | None = Field(default=None, max_length=36)
    sort_order: int | None = Field(default=None, ge=-1_000_000, le=1_000_000)


CatalogStatus = Literal["active", "inactive"]
CatalogImageUrl = Annotated[
    str,
    Field(min_length=1, max_length=2000, pattern=r"^(https?://|/media/).+"),
]


class PriceTierWrite(BaseModel):
    minimum_quantity: int = Field(ge=1, le=1_000_000_000)
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class VariantCreateRequest(BaseModel):
    sku_code: str = Field(min_length=1, max_length=100)
    specifications: dict = Field(default_factory=dict)
    minimum_order_quantity: int = Field(default=1, ge=1, le=1_000_000_000)
    currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    stock_quantity: int = Field(default=0, ge=0, le=1_000_000_000)
    status: CatalogStatus = "active"
    price_tiers: list[PriceTierWrite] = Field(default_factory=list, max_length=100)
    image: str = Field(
        default="",
        max_length=2000,
        pattern=r"^(?:$|https?://.+|/media/.+)$",
    )

    @model_validator(mode="after")
    def validate_price_tiers(self):
        quantities = [item.minimum_quantity for item in self.price_tiers]
        if quantities != sorted(set(quantities)):
            raise ValueError("Price tiers must have unique ascending minimum quantities")
        return self


class VariantUpdateRequest(BaseModel):
    sku_code: str | None = Field(default=None, min_length=1, max_length=100)
    specifications: dict | None = None
    minimum_order_quantity: int | None = Field(default=None, ge=1, le=1_000_000_000)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    stock_quantity: int | None = Field(default=None, ge=0, le=1_000_000_000)
    status: CatalogStatus | None = None
    price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    product_name: str | None = Field(default=None, min_length=1, max_length=200)
    product_category_id: str | None = Field(default=None, max_length=36)


class ProductCreateRequest(BaseModel):
    category_id: str | None = Field(default=None, max_length=36)
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    specification_template: list = Field(default_factory=list, max_length=100)
    status: CatalogStatus = "active"
    images: list[CatalogImageUrl] = Field(default_factory=list, max_length=5)
    detail_image: str = Field(
        default="",
        max_length=2000,
        pattern=r"^(?:$|https?://.+|/media/.+)$",
    )
    variants: list[VariantCreateRequest] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def validate_sku_codes(self):
        codes = [item.sku_code for item in self.variants]
        if len(codes) != len(set(codes)):
            raise ValueError("Product variants must have unique SKU codes")
        return self


class ProductUpdateRequest(BaseModel):
    category_id: str | None = Field(default=None, max_length=36)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    specification_template: list | None = Field(default=None, max_length=100)
    status: CatalogStatus | None = None


ImageType = Literal["product", "product_detail", "sku"]


class ProductImageCreateRequest(BaseModel):
    image_type: ImageType = "product"
    url: str = Field(min_length=1, max_length=2000, pattern=r"^(https?://|/media/).+")
    variant_id: str | None = Field(default=None, max_length=36)


class UploadResponse(BaseModel):
    url: str


class ProductListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[ProductResponse]


class InventoryMovementResponse(BaseModel):
    id: str
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


class InventoryMovementListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[InventoryMovementResponse]


class InventoryAdjustmentRequest(BaseModel):
    variant_id: str = Field(min_length=1, max_length=36)
    movement_type: Literal["inbound", "outbound", "adjustment"] = "adjustment"
    quantity_delta: int = Field(ge=-1_000_000, le=1_000_000)
    reason: str = Field(min_length=1, max_length=500)
    reference: str = Field(default="", max_length=120)

    @model_validator(mode="after")
    def validate_movement_direction(self):
        if self.movement_type == "inbound" and self.quantity_delta <= 0:
            raise ValueError("Inbound inventory quantity must be positive")
        if self.movement_type == "outbound" and self.quantity_delta >= 0:
            raise ValueError("Outbound inventory quantity must be negative")
        return self


class InventoryAdjustmentResponse(BaseModel):
    movement_id: str
    variant_id: str
    sku_code: str
    movement_type: str
    quantity_delta: int
    balance_after: int
    reason: str
    reference: str
    created_by: str


class VariantBatchUpdateItem(VariantUpdateRequest):
    id: str = Field(min_length=1, max_length=36)


class PriceTierBatchItem(BaseModel):
    variant_id: str = Field(min_length=1, max_length=36)
    price_tiers: list[PriceTierWrite] = Field(max_length=100)

    @model_validator(mode="after")
    def validate_price_tiers(self):
        quantities = [item.minimum_quantity for item in self.price_tiers]
        if quantities != sorted(set(quantities)):
            raise ValueError("Price tiers must have unique ascending minimum quantities")
        return self


class InventoryBatchItem(InventoryAdjustmentRequest):
    pass


class PriceTierBatchResponse(BaseModel):
    variant_id: str
    price_tiers: list[PriceTierResponse]


class InventoryBatchResponse(BaseModel):
    items: list[InventoryAdjustmentResponse]


CATEGORY_MAX_DEPTH = 5


def _specification_filter_pairs(
    spec_key: str | None,
    spec_value: str | None,
) -> list[tuple[str, str]]:
    if bool(spec_key) != bool(spec_value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="spec_key and spec_value must be provided together",
        )
    if not spec_key or not spec_value:
        return []
    keys = [item.strip() for item in spec_key.split(",")]
    values = [item.strip() for item in spec_value.split(",")]
    if len(keys) != len(values) or not all(keys) or not all(values):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="spec_key and spec_value must contain matching non-empty values",
        )
    return list(zip(keys, values, strict=True))


async def _get_category(
    workspace_id: str,
    category_id: str,
    session: SessionDep,
) -> Category:
    category = await session.scalar(
        select(Category).where(
            Category.id == category_id,
            Category.workspace_id == workspace_id,
        )
    )
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


async def _category_depth(category: Category, session: SessionDep) -> int:
    depth = 1
    parent_id = category.parent_id
    visited = {category.id}
    while parent_id is not None:
        if parent_id in visited:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Category hierarchy contains a cycle",
            )
        visited.add(parent_id)
        parent = await session.get(Category, parent_id)
        if parent is None or parent.workspace_id != category.workspace_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Category hierarchy has an invalid parent",
            )
        depth += 1
        parent_id = parent.parent_id
    return depth


async def _category_descendants(category_id: str, session: SessionDep) -> set[str]:
    descendants = {category_id}
    frontier = {category_id}
    while frontier:
        children = set(
            await session.scalars(select(Category.id).where(Category.parent_id.in_(frontier)))
        )
        frontier = children - descendants
        descendants.update(frontier)
    return descendants


async def _brand_category_ids(
    workspace_id: str,
    brand_name: str,
    session: SessionDep,
) -> set[str]:
    return set(
        await session.scalars(
            select(Category.id).where(
                Category.workspace_id == workspace_id,
                Category.parent_id.is_not(None),
                func.lower(Category.name) == brand_name.strip().lower(),
            )
        )
    )


async def _category_subtree_height(category_id: str, session: SessionDep) -> int:
    height = 1
    frontier = {category_id}
    visited = {category_id}
    while frontier:
        children = (
            set(await session.scalars(select(Category.id).where(Category.parent_id.in_(frontier))))
            - visited
        )
        if not children:
            break
        height += 1
        visited.update(children)
        frontier = children
    return height


async def _validate_category_parent(
    *,
    workspace_id: str,
    parent_id: str | None,
    session: SessionDep,
    category_id: str | None = None,
) -> None:
    if parent_id is None:
        parent_depth = 0
    else:
        parent = await _get_category(workspace_id, parent_id, session)
        if category_id is not None:
            descendants = await _category_descendants(category_id, session)
            if parent.id in descendants:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Category cannot be moved below itself or its descendants",
                )
        parent_depth = await _category_depth(parent, session)

    subtree_height = (
        await _category_subtree_height(category_id, session) if category_id is not None else 1
    )
    if parent_depth + subtree_height > CATEGORY_MAX_DEPTH:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Category hierarchy cannot exceed {CATEGORY_MAX_DEPTH} levels",
        )


def _product_load_options(*, include_deleted_variants: bool = False):
    options = [
        selectinload(Product.images),
        selectinload(Product.variants).selectinload(ProductVariant.price_tiers),
        selectinload(Product.variants).selectinload(ProductVariant.images),
    ]
    if not include_deleted_variants:
        options.append(
            with_loader_criteria(
                ProductVariant,
                ProductVariant.is_deleted.is_(False),
                include_aliases=True,
            )
        )
    return options


async def _load_product(
    workspace_id: str,
    product_id: str,
    session: SessionDep,
    *,
    include_deleted: bool = False,
) -> Product:
    filters = [Product.id == product_id, Product.workspace_id == workspace_id]
    if not include_deleted:
        filters.append(Product.is_deleted.is_(False))
    product = await session.scalar(
        select(Product)
        .where(*filters)
        .options(*_product_load_options(include_deleted_variants=include_deleted))
        .execution_options(populate_existing=True)
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


async def _load_variant(
    workspace_id: str,
    variant_id: str,
    session: SessionDep,
    *,
    include_deleted: bool = False,
) -> ProductVariant:
    filters = [
        ProductVariant.id == variant_id,
        ProductVariant.workspace_id == workspace_id,
    ]
    if not include_deleted:
        filters.append(ProductVariant.is_deleted.is_(False))
    variant = await session.scalar(
        select(ProductVariant)
        .where(*filters)
        .options(
            selectinload(ProductVariant.price_tiers),
            selectinload(ProductVariant.images),
        )
        .execution_options(populate_existing=True)
    )
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
    return variant


def _new_variant(
    workspace_id: str,
    product_id: str,
    payload: VariantCreateRequest,
) -> ProductVariant:
    variant = ProductVariant(
        id=new_id(),
        workspace_id=workspace_id,
        product_id=product_id,
        sku_code=payload.sku_code,
        specifications=payload.specifications,
        minimum_order_quantity=payload.minimum_order_quantity,
        currency=payload.currency,
        stock_quantity=payload.stock_quantity,
        status=payload.status,
    )
    variant.price_tiers = [
        PriceTier(
            id=new_id(),
            minimum_quantity=item.minimum_quantity,
            unit_price=item.unit_price,
        )
        for item in payload.price_tiers
    ]
    if payload.image:
        variant.images = [
            ProductImage(
                id=new_id(),
                image_type="sku",
                file_key=payload.image,
            )
        ]
    return variant


@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(
    context: WorkspaceDep,
    session: SessionDep,
) -> list[Category]:
    items = (
        await session.scalars(
            select(Category)
            .where(Category.workspace_id == context.workspace.id)
            .order_by(Category.sort_order, Category.created_at)
        )
    ).all()
    return list(items)


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    payload: CategoryCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Category:
    await _validate_category_parent(
        workspace_id=context.workspace.id,
        parent_id=payload.parent_id,
        session=session,
    )
    name = payload.name.strip()
    duplicate_filters = [
        Category.workspace_id == context.workspace.id,
        Category.name == name,
    ]
    duplicate_filters.append(
        Category.parent_id == payload.parent_id
        if payload.parent_id is not None
        else Category.parent_id.is_(None)
    )
    if await session.scalar(select(Category.id).where(*duplicate_filters)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category name already exists below this parent",
        )

    category = Category(
        id=new_id(),
        workspace_id=context.workspace.id,
        name=name,
        parent_id=payload.parent_id,
        sort_order=payload.sort_order,
    )
    session.add(category)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.category_created",
        entity_type="category",
        entity_id=category.id,
        payload={"name": category.name, "parent_id": category.parent_id},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category name already exists below this parent",
        ) from exc
    return category


@router.get("/categories/{category_id}", response_model=CategoryResponse)
async def get_category(
    category_id: str,
    context: WorkspaceDep,
    session: SessionDep,
) -> Category:
    return await _get_category(context.workspace.id, category_id, session)


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: str,
    payload: CategoryUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Category:
    category = await _get_category(context.workspace.id, category_id, session)
    changes = payload.model_dump(exclude_unset=True)
    if "parent_id" in changes:
        await _validate_category_parent(
            workspace_id=context.workspace.id,
            parent_id=changes["parent_id"],
            session=session,
            category_id=category.id,
        )
    if "name" in changes:
        changes["name"] = changes["name"].strip()
    effective_name = changes.get("name", category.name)
    effective_parent_id = changes.get("parent_id", category.parent_id)
    duplicate_filters = [
        Category.workspace_id == context.workspace.id,
        Category.id != category.id,
        Category.name == effective_name,
    ]
    duplicate_filters.append(
        Category.parent_id == effective_parent_id
        if effective_parent_id is not None
        else Category.parent_id.is_(None)
    )
    if await session.scalar(select(Category.id).where(*duplicate_filters)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category name already exists below this parent",
        )
    for field_name, value in changes.items():
        setattr(category, field_name, value)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.category_updated",
        entity_type="category",
        entity_id=category.id,
        payload=changes,
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category name already exists below this parent",
        ) from exc
    return category


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    category = await _get_category(context.workspace.id, category_id, session)
    descendant_ids = await _category_descendants(category.id, session)
    await session.execute(
        update(Product)
        .where(
            Product.workspace_id == context.workspace.id,
            Product.category_id.in_(descendant_ids),
        )
        .values(category_id=None)
    )
    await session.execute(
        delete(Category).where(
            Category.workspace_id == context.workspace.id,
            Category.id.in_(descendant_ids),
        )
    )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.category_deleted",
        entity_type="category",
        entity_id=category.id,
        payload={"name": category.name, "deleted_category_count": len(descendant_ids)},
    )
    await session.commit()


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Product:
    if payload.category_id is not None:
        await _get_category(context.workspace.id, payload.category_id, session)
    product = Product(
        id=new_id(),
        workspace_id=context.workspace.id,
        category_id=payload.category_id,
        name=payload.name.strip(),
        description=payload.description,
        specification_template=payload.specification_template,
        status=payload.status,
    )
    product.variants = [
        _new_variant(context.workspace.id, product.id, item) for item in payload.variants
    ]
    product.images = [
        ProductImage(
            id=new_id(),
            image_type="product",
            file_key=image_url,
        )
        for image_url in payload.images
    ]
    if payload.detail_image:
        product.images.append(
            ProductImage(
                id=new_id(),
                image_type="product_detail",
                file_key=payload.detail_image,
            )
        )
    session.add(product)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.product_created",
        entity_type="product",
        entity_id=product.id,
        payload={
            "name": product.name,
            "variant_count": len(product.variants),
            "image_count": len(product.images),
            "variant_image_count": sum(bool(item.image) for item in payload.variants),
        },
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=[product.id],
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="One or more SKU codes already exist in this Workspace",
        ) from exc
    return await _load_product(context.workspace.id, product.id, session)


@router.get("/products/trash", response_model=list[ProductResponse])
async def list_deleted_products(
    context: WorkspaceDep,
    session: SessionDep,
) -> list[Product]:
    items = (
        (
            await session.scalars(
                select(Product)
                .where(
                    Product.workspace_id == context.workspace.id,
                    Product.is_deleted.is_(True),
                )
                .options(*_product_load_options(include_deleted_variants=True))
                .order_by(Product.deleted_at.desc())
            )
        )
        .unique()
        .all()
    )
    return list(items)


@router.get("/products", response_model=ProductListResponse)
async def list_products(
    context: WorkspaceDep,
    session: SessionDep,
    search: str | None = None,
    status_filter: Annotated[CatalogStatus | None, Query(alias="status")] = None,
    category_id: str | None = None,
    brand_id: str | None = None,
    brand_name: str | None = None,
    stock: Literal["in_stock", "out_of_stock"] | None = None,
    ordering: Literal[
        "created_at",
        "-created_at",
        "updated_at",
        "-updated_at",
        "name",
        "-name",
    ] = "-created_at",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ProductListResponse:
    filters = [Product.workspace_id == context.workspace.id, Product.is_deleted.is_(False)]
    if search:
        filters.append(Product.name.ilike(f"%{search.strip()}%"))
    if status_filter:
        filters.append(Product.status == status_filter)
    if category_id:
        await _get_category(context.workspace.id, category_id, session)
        category_ids = await _category_descendants(category_id, session)
        filters.append(Product.category_id.in_(category_ids))
    if brand_id:
        await _get_category(context.workspace.id, brand_id, session)
        filters.append(Product.category_id == brand_id)
    if brand_name:
        filters.append(
            Product.category_id.in_(
                await _brand_category_ids(context.workspace.id, brand_name, session)
            )
        )
    stocked_product_ids = select(ProductVariant.product_id).where(
        ProductVariant.workspace_id == context.workspace.id,
        ProductVariant.is_deleted.is_(False),
        ProductVariant.stock_quantity > 0,
    )
    if stock == "in_stock":
        filters.append(Product.id.in_(stocked_product_ids))
    elif stock == "out_of_stock":
        filters.append(Product.id.not_in(stocked_product_ids))

    ordering_map = {
        "created_at": Product.created_at.asc(),
        "-created_at": Product.created_at.desc(),
        "updated_at": Product.updated_at.asc(),
        "-updated_at": Product.updated_at.desc(),
        "name": Product.name.asc(),
        "-name": Product.name.desc(),
    }

    total = await session.scalar(select(func.count()).select_from(Product).where(*filters))
    query = (
        select(Product)
        .where(*filters)
        .options(*_product_load_options())
        .order_by(ordering_map[ordering])
        .limit(limit)
        .offset(offset)
    )
    items = (await session.scalars(query)).unique().all()
    return ProductListResponse(total=total or 0, limit=limit, offset=offset, items=list(items))


@router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: str,
    context: WorkspaceDep,
    session: SessionDep,
) -> Product:
    return await _load_product(context.workspace.id, product_id, session)


@router.patch("/products/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: str,
    payload: ProductUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Product:
    product = await _load_product(context.workspace.id, product_id, session)
    changes = payload.model_dump(exclude_unset=True)
    if "category_id" in changes and changes["category_id"] is not None:
        await _get_category(context.workspace.id, changes["category_id"], session)
    if "name" in changes:
        changes["name"] = changes["name"].strip()
    for field_name, value in changes.items():
        setattr(product, field_name, value)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.product_updated",
        entity_type="product",
        entity_id=product.id,
        payload=changes,
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=[product.id],
    )
    await session.commit()
    return await _load_product(context.workspace.id, product.id, session)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    product = await _load_product(context.workspace.id, product_id, session)
    deleted_at = datetime.now(UTC)
    product.is_deleted = True
    product.deleted_at = deleted_at
    await session.execute(
        update(ProductVariant)
        .where(
            ProductVariant.workspace_id == context.workspace.id,
            ProductVariant.product_id == product.id,
        )
        .values(is_deleted=True, deleted_at=deleted_at)
    )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.product_deleted",
        entity_type="product",
        entity_id=product.id,
        payload={"name": product.name},
    )
    remote_product_id = str((product.external_ids or {}).get("shopify_product_id") or "")
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="delete",
        product_ids=[product.id],
        extra_payload={"remote_product_ids": [remote_product_id] if remote_product_id else []},
    )
    await session.commit()


@router.post("/products/{product_id}/restore", response_model=ProductResponse)
async def restore_product(
    product_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Product:
    product = await _load_product(
        context.workspace.id,
        product_id,
        session,
        include_deleted=True,
    )
    if not product.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product is not deleted",
        )
    product.is_deleted = False
    product.deleted_at = None
    await session.execute(
        update(ProductVariant)
        .where(
            ProductVariant.workspace_id == context.workspace.id,
            ProductVariant.product_id == product.id,
        )
        .values(is_deleted=False, deleted_at=None)
    )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.product_restored",
        entity_type="product",
        entity_id=product.id,
        payload={"name": product.name},
    )
    await session.commit()
    return await _load_product(context.workspace.id, product.id, session)


@router.delete("/products/{product_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_product(
    product_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    product = await _load_product(
        context.workspace.id,
        product_id,
        session,
        include_deleted=True,
    )
    if not product.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product must be moved to trash before permanent deletion",
        )
    variant_ids = set(
        await session.scalars(
            select(ProductVariant.id).where(
                ProductVariant.workspace_id == context.workspace.id,
                ProductVariant.product_id == product.id,
            )
        )
    )
    if variant_ids:
        referenced_items = await session.scalar(
            select(func.count()).select_from(OrderItem).where(OrderItem.variant_id.in_(variant_ids))
        )
        if referenced_items:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Product variants referenced by order items cannot be permanently deleted",
            )
        await session.execute(
            delete(InventoryMovement).where(InventoryMovement.variant_id.in_(variant_ids))
        )
        await session.execute(delete(PriceTier).where(PriceTier.variant_id.in_(variant_ids)))
        await session.execute(delete(ProductImage).where(ProductImage.variant_id.in_(variant_ids)))
        await session.execute(delete(ProductVariant).where(ProductVariant.id.in_(variant_ids)))
    await session.execute(delete(ProductImage).where(ProductImage.product_id == product.id))
    await session.execute(delete(Product).where(Product.id == product.id))
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.product_permanently_deleted",
        entity_type="product",
        entity_id=product.id,
        payload={"name": product.name, "variant_count": len(variant_ids)},
    )
    await session.commit()


@router.get("/variants", response_model=list[VariantListItemResponse])
async def list_variants(
    context: WorkspaceDep,
    session: SessionDep,
    search: str | None = None,
    status_filter: Annotated[CatalogStatus | None, Query(alias="status")] = None,
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
) -> list[VariantListItemResponse]:
    filters = [
        ProductVariant.workspace_id == context.workspace.id,
        ProductVariant.is_deleted.is_(False),
        Product.is_deleted.is_(False),
    ]
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                ProductVariant.sku_code.ilike(term),
                Product.name.ilike(term),
                cast(ProductVariant.specifications, String).ilike(term),
            )
        )
    if status_filter:
        filters.append(ProductVariant.status == status_filter)
    if stock == "in_stock":
        filters.append(ProductVariant.stock_quantity > 0)
    elif stock == "out_of_stock":
        filters.append(ProductVariant.stock_quantity == 0)
    if category_id:
        await _get_category(context.workspace.id, category_id, session)
        category_ids = await _category_descendants(category_id, session)
        filters.append(Product.category_id.in_(category_ids))
    if brand_id:
        await _get_category(context.workspace.id, brand_id, session)
        filters.append(Product.category_id == brand_id)
    if brand_name:
        filters.append(
            Product.category_id.in_(
                await _brand_category_ids(context.workspace.id, brand_name, session)
            )
        )
    if product_id:
        filters.append(Product.id == product_id)
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
    return [
        VariantListItemResponse(
            **VariantResponse.model_validate(variant).model_dump(),
            product_name=product_name,
            category_id=row_category_id,
        )
        for variant, product_name, row_category_id in rows
    ]


@router.get("/variants/trash", response_model=list[VariantResponse])
async def list_deleted_variants(
    context: WorkspaceDep,
    session: SessionDep,
) -> list[ProductVariant]:
    items = (
        await session.scalars(
            select(ProductVariant)
            .where(
                ProductVariant.workspace_id == context.workspace.id,
                ProductVariant.is_deleted.is_(True),
            )
            .options(
                selectinload(ProductVariant.price_tiers),
                selectinload(ProductVariant.images),
            )
            .order_by(ProductVariant.deleted_at.desc())
        )
    ).all()
    return list(items)


@router.get("/variants/{variant_id}", response_model=VariantResponse)
async def get_variant(
    variant_id: str,
    context: WorkspaceDep,
    session: SessionDep,
) -> ProductVariant:
    return await _load_variant(context.workspace.id, variant_id, session)


@router.post(
    "/products/{product_id}/variants",
    response_model=VariantResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_variant(
    product_id: str,
    payload: VariantCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> ProductVariant:
    product = await _load_product(context.workspace.id, product_id, session)
    variant = _new_variant(context.workspace.id, product.id, payload)
    session.add(variant)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.variant_created",
        entity_type="product_variant",
        entity_id=variant.id,
        payload={"product_id": product.id, "sku_code": variant.sku_code},
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=[product.id],
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="SKU code already exists in this Workspace",
        ) from exc
    return await _load_variant(context.workspace.id, variant.id, session)


@router.patch("/variants/{variant_id}", response_model=VariantResponse)
async def update_variant(
    variant_id: str,
    payload: VariantUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> ProductVariant:
    variant = await _load_variant(context.workspace.id, variant_id, session)
    changes = payload.model_dump(exclude_unset=True)
    price = changes.pop("price", None)
    product_changes = {}
    if "product_name" in changes:
        product_changes["name"] = changes.pop("product_name")
    if "product_category_id" in changes:
        product_changes["category_id"] = changes.pop("product_category_id")
    product = await session.scalar(
        select(Product)
        .where(
            Product.id == variant.product_id,
            Product.workspace_id == context.workspace.id,
            Product.is_deleted.is_(False),
        )
        .with_for_update()
    )
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    if product_changes.get("category_id") is not None:
        await _get_category(context.workspace.id, product_changes["category_id"], session)
    for field_name, value in changes.items():
        setattr(variant, field_name, value)
    for field_name, value in product_changes.items():
        setattr(product, field_name, value)
    if price is not None:
        first_tier = min(variant.price_tiers, key=lambda item: item.minimum_quantity, default=None)
        if first_tier is None:
            first_tier = PriceTier(
                id=new_id(),
                variant_id=variant.id,
                minimum_quantity=1,
                unit_price=price,
            )
            session.add(first_tier)
        else:
            first_tier.unit_price = price
    if changes.get("status") == "inactive" and product.status == "active":
        await session.flush()
        active_variants = await session.scalar(
            select(func.count())
            .select_from(ProductVariant)
            .where(
                ProductVariant.product_id == product.id,
                ProductVariant.is_deleted.is_(False),
                ProductVariant.status == "active",
            )
        )
        if not active_variants:
            product.status = "inactive"
    audit_changes = {**changes, **product_changes}
    if price is not None:
        audit_changes["price"] = str(price)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.variant_updated",
        entity_type="product_variant",
        entity_id=variant.id,
        payload=audit_changes,
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=[variant.product_id],
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="SKU code already exists in this Workspace",
        ) from exc
    return await _load_variant(context.workspace.id, variant.id, session)


@router.delete("/variants/{variant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variant(
    variant_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    variant = await _load_variant(context.workspace.id, variant_id, session)
    variant.is_deleted = True
    variant.deleted_at = datetime.now(UTC)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.variant_deleted",
        entity_type="product_variant",
        entity_id=variant.id,
        payload={"sku_code": variant.sku_code},
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=[variant.product_id],
    )
    await session.commit()


@router.post("/variants/{variant_id}/restore", response_model=VariantResponse)
async def restore_variant(
    variant_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> ProductVariant:
    variant = await _load_variant(
        context.workspace.id,
        variant_id,
        session,
        include_deleted=True,
    )
    if not variant.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Variant is not deleted",
        )
    product = await session.scalar(
        select(Product).where(
            Product.id == variant.product_id,
            Product.workspace_id == context.workspace.id,
            Product.is_deleted.is_(False),
        )
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Restore the parent product before restoring this variant",
        )
    variant.is_deleted = False
    variant.deleted_at = None
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.variant_restored",
        entity_type="product_variant",
        entity_id=variant.id,
        payload={"sku_code": variant.sku_code},
    )
    await session.commit()
    return await _load_variant(context.workspace.id, variant.id, session)


@router.delete("/variants/{variant_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
async def permanently_delete_variant(
    variant_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    variant = await _load_variant(
        context.workspace.id,
        variant_id,
        session,
        include_deleted=True,
    )
    if not variant.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Variant must be moved to trash before permanent deletion",
        )
    referenced_items = await session.scalar(
        select(func.count()).select_from(OrderItem).where(OrderItem.variant_id == variant.id)
    )
    if referenced_items:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A variant referenced by order items cannot be permanently deleted",
        )
    await session.execute(
        delete(InventoryMovement).where(InventoryMovement.variant_id == variant.id)
    )
    await session.execute(delete(PriceTier).where(PriceTier.variant_id == variant.id))
    await session.execute(delete(ProductImage).where(ProductImage.variant_id == variant.id))
    await session.execute(delete(ProductVariant).where(ProductVariant.id == variant.id))
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.variant_permanently_deleted",
        entity_type="product_variant",
        entity_id=variant.id,
        payload={"sku_code": variant.sku_code},
    )
    await session.commit()


@router.get("/specification-options", response_model=dict[str, list[str]])
async def list_specification_options(
    context: WorkspaceDep,
    session: SessionDep,
) -> dict[str, list[str]]:
    product_templates = await session.scalars(
        select(Product.specification_template).where(
            Product.workspace_id == context.workspace.id,
            Product.is_deleted.is_(False),
        )
    )
    variant_specifications = await session.scalars(
        select(ProductVariant.specifications).where(
            ProductVariant.workspace_id == context.workspace.id,
            ProductVariant.is_deleted.is_(False),
        )
    )
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


@router.put("/variants/{variant_id}/price-tiers", response_model=list[PriceTierResponse])
async def replace_price_tiers(
    variant_id: str,
    payload: Annotated[list[PriceTierWrite], Field(max_length=100)],
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> list[PriceTier]:
    variant = await _load_variant(context.workspace.id, variant_id, session)
    quantities = [item.minimum_quantity for item in payload]
    if quantities != sorted(set(quantities)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Price tiers must have unique ascending minimum quantities",
        )
    await session.execute(delete(PriceTier).where(PriceTier.variant_id == variant.id))
    tiers = [
        PriceTier(
            id=new_id(),
            variant_id=variant.id,
            minimum_quantity=item.minimum_quantity,
            unit_price=item.unit_price,
        )
        for item in payload
    ]
    session.add_all(tiers)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.price_tiers_replaced",
        entity_type="product_variant",
        entity_id=variant.id,
        payload={"tiers": [item.model_dump(mode="json") for item in payload]},
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=[variant.product_id],
    )
    await session.commit()
    return tiers


@router.patch("/batch/variants", response_model=list[VariantResponse])
async def batch_update_variants(
    payload: Annotated[list[VariantBatchUpdateItem], Field(min_length=1, max_length=500)],
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> list[ProductVariant]:
    variant_ids = [item.id for item in payload]
    if len(variant_ids) != len(set(variant_ids)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A variant can only appear once in a batch",
        )
    variants = (
        await session.scalars(
            select(ProductVariant)
            .where(
                ProductVariant.id.in_(variant_ids),
                ProductVariant.workspace_id == context.workspace.id,
                ProductVariant.is_deleted.is_(False),
            )
            .with_for_update()
        )
    ).all()
    variant_map = {item.id: item for item in variants}
    missing = sorted(set(variant_ids) - set(variant_map))
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "One or more variants were not found", "ids": missing},
        )
    products = {
        item.id: item
        for item in (
            await session.scalars(
                select(Product)
                .where(
                    Product.id.in_({variant.product_id for variant in variants}),
                    Product.workspace_id == context.workspace.id,
                    Product.is_deleted.is_(False),
                )
                .with_for_update()
            )
        ).all()
    }
    if len(products) != len({variant.product_id for variant in variants}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    category_ids = {
        item.product_category_id
        for item in payload
        if "product_category_id" in item.model_fields_set
        and item.product_category_id is not None
    }
    if category_ids:
        found_category_ids = set(
            await session.scalars(
                select(Category.id).where(
                    Category.id.in_(category_ids),
                    Category.workspace_id == context.workspace.id,
                )
            )
        )
        missing_categories = sorted(category_ids - found_category_ids)
        if missing_categories:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"message": "One or more categories were not found", "ids": missing_categories},
            )
    for item in payload:
        changes = item.model_dump(exclude={"id"}, exclude_unset=True)
        product_name = changes.pop("product_name", None)
        category_supplied = "product_category_id" in changes
        product_category_id = changes.pop("product_category_id", None)
        for field_name, value in changes.items():
            setattr(variant_map[item.id], field_name, value)
        product = products[variant_map[item.id].product_id]
        if product_name is not None:
            product.name = product_name
        if category_supplied:
            product.category_id = product_category_id
    await session.flush()
    for product in products.values():
        if product.status != "active":
            continue
        active_variants = await session.scalar(
            select(func.count())
            .select_from(ProductVariant)
            .where(
                ProductVariant.product_id == product.id,
                ProductVariant.is_deleted.is_(False),
                ProductVariant.status == "active",
            )
        )
        if not active_variants:
            product.status = "inactive"
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.variants_batch_updated",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"variant_ids": variant_ids},
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=sorted({variant.product_id for variant in variants}),
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Batch contains an SKU code that already exists",
        ) from exc
    return [await _load_variant(context.workspace.id, item.id, session) for item in payload]


@router.put("/batch/price-tiers", response_model=list[PriceTierBatchResponse])
async def batch_replace_price_tiers(
    payload: Annotated[list[PriceTierBatchItem], Field(min_length=1, max_length=500)],
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> list[PriceTierBatchResponse]:
    variant_ids = [item.variant_id for item in payload]
    if len(variant_ids) != len(set(variant_ids)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A variant can only appear once in a batch",
        )
    found_rows = (
        await session.execute(
            select(ProductVariant.id, ProductVariant.product_id).where(
                ProductVariant.id.in_(variant_ids),
                ProductVariant.workspace_id == context.workspace.id,
                ProductVariant.is_deleted.is_(False),
            )
        )
    ).all()
    found_ids = {variant_id for variant_id, _product_id in found_rows}
    missing = sorted(set(variant_ids) - found_ids)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "One or more variants were not found", "ids": missing},
        )
    await session.execute(delete(PriceTier).where(PriceTier.variant_id.in_(variant_ids)))
    response: list[PriceTierBatchResponse] = []
    for item in payload:
        tiers = [
            PriceTier(
                id=new_id(),
                variant_id=item.variant_id,
                minimum_quantity=tier.minimum_quantity,
                unit_price=tier.unit_price,
            )
            for tier in item.price_tiers
        ]
        session.add_all(tiers)
        response.append(
            PriceTierBatchResponse(
                variant_id=item.variant_id,
                price_tiers=[PriceTierResponse.model_validate(tier) for tier in tiers],
            )
        )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.price_tiers_batch_replaced",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"variant_ids": variant_ids},
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=sorted({product_id for _variant_id, product_id in found_rows}),
    )
    await session.commit()
    return response


@router.post(
    "/batch/inventory-adjustments",
    response_model=InventoryBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def batch_adjust_inventory(
    payload: Annotated[list[InventoryBatchItem], Field(min_length=1, max_length=500)],
    context: WorkspaceWriteDep,
    session: SessionDep,
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> InventoryBatchResponse:
    if any(item.quantity_delta == 0 for item in payload):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Every inventory adjustment must change the balance",
        )
    scope = "inventory.batch_adjustment"
    canonical_request = json.dumps(
        [item.model_dump(mode="json") for item in payload],
        sort_keys=True,
        separators=(",", ":"),
    )
    request_hash = hashlib.sha256(canonical_request.encode()).hexdigest()
    existing = await session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.workspace_id == context.workspace.id,
            IdempotencyRecord.scope == scope,
            IdempotencyRecord.key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency key was already used for a different request",
            )
        return InventoryBatchResponse.model_validate(existing.response_payload)

    variant_ids = {item.variant_id for item in payload}
    variants = (
        await session.scalars(
            select(ProductVariant)
            .where(
                ProductVariant.id.in_(variant_ids),
                ProductVariant.workspace_id == context.workspace.id,
                ProductVariant.is_deleted.is_(False),
            )
            .order_by(ProductVariant.id)
            .with_for_update()
        )
    ).all()
    variant_map = {item.id: item for item in variants}
    missing = sorted(variant_ids - set(variant_map))
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "One or more variants were not found", "ids": missing},
        )

    balances = {item.id: item.stock_quantity for item in variants}
    response_items: list[InventoryAdjustmentResponse] = []
    for item in payload:
        balance_after = balances[item.variant_id] + item.quantity_delta
        if balance_after < 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Inventory adjustment would make variant {item.variant_id} negative",
            )
        balances[item.variant_id] = balance_after
        variant = variant_map[item.variant_id]
        movement = InventoryMovement(
            id=new_id(),
            workspace_id=context.workspace.id,
            variant_id=variant.id,
            movement_type=item.movement_type,
            quantity_delta=item.quantity_delta,
            balance_after=balance_after,
            reason=item.reason,
            reference=item.reference,
            created_by=context.user.username,
        )
        session.add(movement)
        response_items.append(
            InventoryAdjustmentResponse(
                movement_id=movement.id,
                variant_id=variant.id,
                sku_code=variant.sku_code,
                movement_type=movement.movement_type,
                quantity_delta=movement.quantity_delta,
                balance_after=balance_after,
                reason=movement.reason,
                reference=movement.reference,
                created_by=movement.created_by,
            )
        )
    for variant_id, balance in balances.items():
        variant_map[variant_id].stock_quantity = balance
    response = InventoryBatchResponse(items=response_items)
    session.add(
        IdempotencyRecord(
            workspace_id=context.workspace.id,
            scope=scope,
            key=idempotency_key,
            request_hash=request_hash,
            response_payload=response.model_dump(mode="json"),
        )
    )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="inventory.batch_adjusted",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"movement_count": len(response_items), "variant_ids": sorted(variant_ids)},
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="inventory",
        product_ids=sorted({variant.product_id for variant in variants}),
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        concurrent = await session.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.workspace_id == context.workspace.id,
                IdempotencyRecord.scope == scope,
                IdempotencyRecord.key == idempotency_key,
            )
        )
        if concurrent is not None and concurrent.request_hash == request_hash:
            return InventoryBatchResponse.model_validate(concurrent.response_payload)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Idempotency key was claimed by another request",
        ) from exc
    return response


@router.post("/uploads", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_catalog_file(
    request: Request,
    context: WorkspaceWriteDep,
    file: Annotated[UploadFile, File()],
) -> UploadResponse:
    del context
    url = await save_upload(
        file,
        directory=request.app.state.upload_directory,
        max_bytes=request.app.state.max_upload_bytes,
        settings=request.app.state.settings,
    )
    return UploadResponse(url=url)


@router.post(
    "/products/{product_id}/images",
    response_model=ProductImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_product_image(
    product_id: str,
    payload: ProductImageCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> ProductImage:
    product = await _load_product(context.workspace.id, product_id, session)
    if payload.image_type == "sku":
        if payload.variant_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="A variant_id is required for an SKU image",
            )
        variant = await _load_variant(context.workspace.id, payload.variant_id, session)
        if variant.product_id != product.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Variant does not belong to this product",
            )
        await session.execute(
            delete(ProductImage).where(
                ProductImage.variant_id == variant.id,
                ProductImage.image_type == "sku",
            )
        )
        image = ProductImage(
            id=new_id(),
            variant_id=variant.id,
            image_type="sku",
            file_key=payload.url,
        )
    else:
        if payload.variant_id is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="variant_id is only valid for an SKU image",
            )
        if payload.image_type == "product":
            image_count = await session.scalar(
                select(func.count())
                .select_from(ProductImage)
                .where(
                    ProductImage.product_id == product.id,
                    ProductImage.image_type == "product",
                )
            )
            if (image_count or 0) >= 5:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A product can have at most five gallery images",
                )
        else:
            await session.execute(
                delete(ProductImage).where(
                    ProductImage.product_id == product.id,
                    ProductImage.image_type == "product_detail",
                )
            )
        image = ProductImage(
            id=new_id(),
            product_id=product.id,
            image_type=payload.image_type,
            file_key=payload.url,
        )

    session.add(image)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.product_image_created",
        entity_type="product_image",
        entity_id=image.id,
        payload={
            "product_id": product.id,
            "variant_id": image.variant_id,
            "image_type": image.image_type,
        },
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=[product.id],
    )
    await session.commit()
    return image


@router.delete(
    "/products/{product_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_product_image(
    product_id: str,
    image_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    product = await _load_product(context.workspace.id, product_id, session)
    image = await session.scalar(
        select(ProductImage)
        .outerjoin(ProductVariant, ProductImage.variant_id == ProductVariant.id)
        .where(
            ProductImage.id == image_id,
            or_(
                ProductImage.product_id == product.id,
                ProductVariant.product_id == product.id,
            ),
        )
    )
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product image not found")
    payload = {
        "product_id": product.id,
        "variant_id": image.variant_id,
        "image_type": image.image_type,
    }
    await session.delete(image)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="catalog.product_image_deleted",
        entity_type="product_image",
        entity_id=image.id,
        payload=payload,
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="catalog",
        product_ids=[product.id],
    )
    await session.commit()


@router.get("/inventory-movements", response_model=InventoryMovementListResponse)
async def list_inventory_movements(
    context: WorkspaceDep,
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
) -> InventoryMovementListResponse:
    if page is not None or page_size is not None:
        limit = page_size or limit
        offset = ((page or 1) - 1) * limit
    filters = [InventoryMovement.workspace_id == context.workspace.id]
    if variant_id:
        await _load_variant(context.workspace.id, variant_id, session, include_deleted=True)
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
    query = (
        select(InventoryMovement, ProductVariant.sku_code, Product.name)
        .join(ProductVariant, ProductVariant.id == InventoryMovement.variant_id)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(*filters)
        .order_by(ordering_map[ordering], InventoryMovement.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(query)).all()
    return InventoryMovementListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            InventoryMovementResponse(
                id=movement.id,
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


@router.post(
    "/inventory-adjustments",
    response_model=InventoryAdjustmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def adjust_inventory(
    payload: InventoryAdjustmentRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> InventoryAdjustmentResponse:
    scope = "inventory.adjustment"
    canonical_request = json.dumps(
        payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    )
    request_hash = hashlib.sha256(canonical_request.encode()).hexdigest()
    existing = await session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.workspace_id == context.workspace.id,
            IdempotencyRecord.scope == scope,
            IdempotencyRecord.key == idempotency_key,
        )
    )
    if existing is not None:
        if existing.request_hash != request_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency key was already used for a different request",
            )
        return InventoryAdjustmentResponse.model_validate(existing.response_payload)

    variant = await session.scalar(
        select(ProductVariant)
        .where(
            ProductVariant.id == payload.variant_id,
            ProductVariant.workspace_id == context.workspace.id,
            ProductVariant.is_deleted.is_(False),
        )
        .with_for_update()
    )
    if variant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
    if payload.quantity_delta == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Inventory adjustment must change the balance",
        )

    balance_after = variant.stock_quantity + payload.quantity_delta
    if balance_after < 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Inventory adjustment would make stock negative",
        )

    movement = InventoryMovement(
        id=new_id(),
        workspace_id=context.workspace.id,
        variant_id=variant.id,
        movement_type=payload.movement_type,
        quantity_delta=payload.quantity_delta,
        balance_after=balance_after,
        reason=payload.reason,
        reference=payload.reference,
        created_by=context.user.username,
    )
    variant.stock_quantity = balance_after
    session.add(movement)
    response = InventoryAdjustmentResponse(
        movement_id=movement.id,
        variant_id=variant.id,
        sku_code=variant.sku_code,
        movement_type=movement.movement_type,
        quantity_delta=movement.quantity_delta,
        balance_after=balance_after,
        reason=movement.reason,
        reference=movement.reference,
        created_by=movement.created_by,
    )
    session.add(
        IdempotencyRecord(
            workspace_id=context.workspace.id,
            scope=scope,
            key=idempotency_key,
            request_hash=request_hash,
            response_payload=response.model_dump(mode="json"),
        )
    )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="inventory.adjusted",
        entity_type="product_variant",
        entity_id=variant.id,
        payload={
            "quantity_delta": payload.quantity_delta,
            "balance_after": balance_after,
            "reference": payload.reference,
        },
    )
    await enqueue_catalog_sync_if_configured(
        session,
        workspace_id=context.workspace.id,
        operation="inventory",
        product_ids=[variant.product_id],
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        concurrent = await session.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.workspace_id == context.workspace.id,
                IdempotencyRecord.scope == scope,
                IdempotencyRecord.key == idempotency_key,
            )
        )
        if concurrent is not None and concurrent.request_hash == request_hash:
            return InventoryAdjustmentResponse.model_validate(concurrent.response_payload)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Idempotency key was claimed by another request",
        ) from exc
    return response
