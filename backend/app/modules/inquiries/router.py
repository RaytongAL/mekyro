from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select, update

from app.core.audit import record_audit
from app.core.dependencies import PlatformAdmin, SessionDep
from app.core.models import BuyerInquiry, Quote, SupplierInquiry, Workspace, new_id

router = APIRouter(prefix="/inquiries", tags=["inquiries"])

InquiryStatus = Literal["pending", "processing", "completed", "rejected"]
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class SupplierInquiryCreateRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    main_business: str = Field(min_length=1, max_length=500)
    country: str = Field(min_length=2, max_length=2, pattern=r"^[a-zA-Z]{2}$")
    contact_name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=1, max_length=30)
    email: str = Field(
        min_length=5,
        max_length=254,
        pattern=EMAIL_PATTERN,
    )
    remark: str = Field(default="", max_length=10000)


class BuyerInquiryCreateRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    required_product: str = Field(min_length=1, max_length=500)
    country: str = Field(min_length=2, max_length=2, pattern=r"^[a-zA-Z]{2}$")
    contact_name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=1, max_length=30)
    email: str = Field(
        min_length=5,
        max_length=254,
        pattern=EMAIL_PATTERN,
    )
    remark: str = Field(default="", max_length=10000)


class SupplierInquiryUpdateRequest(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    main_business: str | None = Field(default=None, min_length=1, max_length=500)
    country: str | None = Field(default=None, min_length=2, max_length=2, pattern=r"^[a-zA-Z]{2}$")
    contact_name: str | None = Field(default=None, min_length=1, max_length=150)
    phone: str | None = Field(default=None, min_length=1, max_length=30)
    email: str | None = Field(
        default=None,
        min_length=5,
        max_length=254,
        pattern=EMAIL_PATTERN,
    )
    remark: str | None = Field(default=None, max_length=10000)
    status: InquiryStatus | None = None


class BuyerInquiryUpdateRequest(BaseModel):
    assigned_workspace_id: str | None = Field(default=None, max_length=36)
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    required_product: str | None = Field(default=None, min_length=1, max_length=500)
    country: str | None = Field(default=None, min_length=2, max_length=2, pattern=r"^[a-zA-Z]{2}$")
    contact_name: str | None = Field(default=None, min_length=1, max_length=150)
    phone: str | None = Field(default=None, min_length=1, max_length=30)
    email: str | None = Field(
        default=None,
        min_length=5,
        max_length=254,
        pattern=EMAIL_PATTERN,
    )
    remark: str | None = Field(default=None, max_length=10000)
    status: InquiryStatus | None = None


class SupplierInquiryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_name: str
    main_business: str
    country: str
    contact_name: str
    phone: str
    email: str
    remark: str
    status: str
    created_at: datetime
    updated_at: datetime


class BuyerInquiryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    assigned_workspace_id: str | None
    company_name: str
    required_product: str
    country: str
    contact_name: str
    phone: str
    email: str
    remark: str
    status: str
    created_at: datetime
    updated_at: datetime


class SupplierInquiryListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[SupplierInquiryResponse]


class BuyerInquiryListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[BuyerInquiryResponse]


async def _get_supplier_inquiry(inquiry_id: str, session: SessionDep) -> SupplierInquiry:
    inquiry = await session.get(SupplierInquiry, inquiry_id)
    if inquiry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier inquiry not found",
        )
    return inquiry


async def _get_buyer_inquiry(inquiry_id: str, session: SessionDep) -> BuyerInquiry:
    inquiry = await session.get(BuyerInquiry, inquiry_id)
    if inquiry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Buyer inquiry not found",
        )
    return inquiry


@router.post(
    "/suppliers",
    response_model=SupplierInquiryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_supplier_inquiry(
    payload: SupplierInquiryCreateRequest,
    session: SessionDep,
) -> SupplierInquiry:
    values = payload.model_dump()
    values.update(country=payload.country.upper(), email=payload.email.lower())
    inquiry = SupplierInquiry(
        id=new_id(),
        **values,
    )
    session.add(inquiry)
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=None,
        action="inquiry.supplier_submitted",
        entity_type="supplier_inquiry",
        entity_id=inquiry.id,
        payload={"company_name": inquiry.company_name, "country": inquiry.country},
    )
    await session.commit()
    return inquiry


@router.post(
    "/buyers",
    response_model=BuyerInquiryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_buyer_inquiry(
    payload: BuyerInquiryCreateRequest,
    session: SessionDep,
) -> BuyerInquiry:
    values = payload.model_dump()
    values.update(country=payload.country.upper(), email=payload.email.lower())
    inquiry = BuyerInquiry(
        id=new_id(),
        **values,
    )
    session.add(inquiry)
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=None,
        action="inquiry.buyer_submitted",
        entity_type="buyer_inquiry",
        entity_id=inquiry.id,
        payload={"company_name": inquiry.company_name, "country": inquiry.country},
    )
    await session.commit()
    return inquiry


@router.get("/suppliers", response_model=SupplierInquiryListResponse)
async def list_supplier_inquiries(
    admin: PlatformAdmin,
    session: SessionDep,
    search: str | None = None,
    inquiry_status: Annotated[InquiryStatus | None, Query(alias="status")] = None,
    country: str | None = None,
    ordering: Literal[
        "id", "-id", "created_at", "-created_at", "company_name", "-company_name"
    ] = "-id",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SupplierInquiryListResponse:
    del admin
    filters = []
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                SupplierInquiry.company_name.ilike(term),
                SupplierInquiry.main_business.ilike(term),
                SupplierInquiry.contact_name.ilike(term),
                SupplierInquiry.email.ilike(term),
            )
        )
    if inquiry_status:
        filters.append(SupplierInquiry.status == inquiry_status)
    if country:
        filters.append(SupplierInquiry.country == country.upper())
    total = await session.scalar(select(func.count()).select_from(SupplierInquiry).where(*filters))
    ordering_map = {
        "id": SupplierInquiry.created_at.asc(),
        "-id": SupplierInquiry.created_at.desc(),
        "created_at": SupplierInquiry.created_at.asc(),
        "-created_at": SupplierInquiry.created_at.desc(),
        "company_name": SupplierInquiry.company_name.asc(),
        "-company_name": SupplierInquiry.company_name.desc(),
    }
    items = (
        await session.scalars(
            select(SupplierInquiry)
            .where(*filters)
            .order_by(ordering_map[ordering])
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return SupplierInquiryListResponse(
        total=total or 0,
        limit=limit,
        offset=offset,
        items=list(items),
    )


@router.get("/buyers", response_model=BuyerInquiryListResponse)
async def list_buyer_inquiries(
    admin: PlatformAdmin,
    session: SessionDep,
    search: str | None = None,
    inquiry_status: Annotated[InquiryStatus | None, Query(alias="status")] = None,
    country: str | None = None,
    assigned_workspace_id: str | None = None,
    ordering: Literal[
        "id", "-id", "created_at", "-created_at", "company_name", "-company_name"
    ] = "-id",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> BuyerInquiryListResponse:
    del admin
    filters = []
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                BuyerInquiry.company_name.ilike(term),
                BuyerInquiry.required_product.ilike(term),
                BuyerInquiry.contact_name.ilike(term),
                BuyerInquiry.email.ilike(term),
            )
        )
    if inquiry_status:
        filters.append(BuyerInquiry.status == inquiry_status)
    if country:
        filters.append(BuyerInquiry.country == country.upper())
    if assigned_workspace_id:
        filters.append(BuyerInquiry.assigned_workspace_id == assigned_workspace_id)
    total = await session.scalar(select(func.count()).select_from(BuyerInquiry).where(*filters))
    ordering_map = {
        "id": BuyerInquiry.created_at.asc(),
        "-id": BuyerInquiry.created_at.desc(),
        "created_at": BuyerInquiry.created_at.asc(),
        "-created_at": BuyerInquiry.created_at.desc(),
        "company_name": BuyerInquiry.company_name.asc(),
        "-company_name": BuyerInquiry.company_name.desc(),
    }
    items = (
        await session.scalars(
            select(BuyerInquiry)
            .where(*filters)
            .order_by(ordering_map[ordering])
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return BuyerInquiryListResponse(
        total=total or 0,
        limit=limit,
        offset=offset,
        items=list(items),
    )


@router.get("/suppliers/{inquiry_id}", response_model=SupplierInquiryResponse)
async def get_supplier_inquiry(
    inquiry_id: str,
    admin: PlatformAdmin,
    session: SessionDep,
) -> SupplierInquiry:
    del admin
    return await _get_supplier_inquiry(inquiry_id, session)


@router.get("/buyers/{inquiry_id}", response_model=BuyerInquiryResponse)
async def get_buyer_inquiry(
    inquiry_id: str,
    admin: PlatformAdmin,
    session: SessionDep,
) -> BuyerInquiry:
    del admin
    return await _get_buyer_inquiry(inquiry_id, session)


@router.patch("/suppliers/{inquiry_id}", response_model=SupplierInquiryResponse)
async def update_supplier_inquiry(
    inquiry_id: str,
    payload: SupplierInquiryUpdateRequest,
    admin: PlatformAdmin,
    session: SessionDep,
) -> SupplierInquiry:
    inquiry = await _get_supplier_inquiry(inquiry_id, session)
    changes = payload.model_dump(exclude_unset=True)
    if "country" in changes:
        changes["country"] = changes["country"].upper()
    if "email" in changes:
        changes["email"] = changes["email"].lower()
    for field_name, value in changes.items():
        setattr(inquiry, field_name, value)
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=admin.id,
        action="inquiry.supplier_updated",
        entity_type="supplier_inquiry",
        entity_id=inquiry.id,
        payload={"fields": sorted(changes)},
    )
    await session.commit()
    return inquiry


@router.patch("/buyers/{inquiry_id}", response_model=BuyerInquiryResponse)
async def update_buyer_inquiry(
    inquiry_id: str,
    payload: BuyerInquiryUpdateRequest,
    admin: PlatformAdmin,
    session: SessionDep,
) -> BuyerInquiry:
    inquiry = await _get_buyer_inquiry(inquiry_id, session)
    changes = payload.model_dump(exclude_unset=True)
    assigned_workspace_id = changes.get("assigned_workspace_id")
    if assigned_workspace_id is not None:
        workspace = await session.get(Workspace, assigned_workspace_id)
        if workspace is None or not workspace.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )
    if "country" in changes:
        changes["country"] = changes["country"].upper()
    if "email" in changes:
        changes["email"] = changes["email"].lower()
    for field_name, value in changes.items():
        setattr(inquiry, field_name, value)
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=admin.id,
        action="inquiry.buyer_updated",
        entity_type="buyer_inquiry",
        entity_id=inquiry.id,
        payload={"fields": sorted(changes)},
    )
    await session.commit()
    return inquiry


@router.delete("/suppliers/{inquiry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_supplier_inquiry(
    inquiry_id: str,
    admin: PlatformAdmin,
    session: SessionDep,
) -> None:
    inquiry = await _get_supplier_inquiry(inquiry_id, session)
    await session.delete(inquiry)
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=admin.id,
        action="inquiry.supplier_deleted",
        entity_type="supplier_inquiry",
        entity_id=inquiry.id,
        payload={"company_name": inquiry.company_name},
    )
    await session.commit()


@router.delete("/buyers/{inquiry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_buyer_inquiry(
    inquiry_id: str,
    admin: PlatformAdmin,
    session: SessionDep,
) -> None:
    inquiry = await _get_buyer_inquiry(inquiry_id, session)
    await session.execute(
        update(Quote).where(Quote.buyer_inquiry_id == inquiry.id).values(buyer_inquiry_id=None)
    )
    await session.delete(inquiry)
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=admin.id,
        action="inquiry.buyer_deleted",
        entity_type="buyer_inquiry",
        entity_id=inquiry.id,
        payload={"company_name": inquiry.company_name},
    )
    await session.commit()
