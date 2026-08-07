import hashlib
import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.audit import record_audit
from app.core.dependencies import SessionDep, WorkspaceDep, WorkspaceWriteDep
from app.core.models import (
    BuyerInquiry,
    IdempotencyRecord,
    Lead,
    Order,
    OrderItem,
    Product,
    ProductVariant,
    Quote,
    QuoteItem,
    QuoteVersion,
    new_id,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/quotes", tags=["quotes"])

QuoteStatus = Literal["draft", "sent", "accepted", "rejected", "expired"]
MAX_QUOTE_AMOUNT = Decimal("999999999999.99")


def default_valid_until() -> date:
    return date.today() + timedelta(days=30)


class QuoteItemWrite(BaseModel):
    variant_id: str = Field(min_length=1, max_length=36)
    description: str = Field(default="", max_length=500)
    quantity: int = Field(ge=1, le=1_000_000_000)
    unit_price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class QuoteCreateRequest(BaseModel):
    quote_number: str | None = Field(default=None, min_length=1, max_length=55)
    lead_id: str | None = Field(default=None, max_length=36)
    buyer_inquiry_id: str | None = Field(default=None, max_length=36)
    currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    valid_until: date = Field(default_factory=default_valid_until)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    shipping_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    notes: str = Field(default="", max_length=10000)
    terms: str = Field(default="", max_length=10000)
    items: list[QuoteItemWrite] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_source_and_items(self):
        if self.lead_id is None and self.buyer_inquiry_id is None:
            raise ValueError("A lead or assigned buyer inquiry is required")
        variant_ids = [item.variant_id for item in self.items]
        if len(variant_ids) != len(set(variant_ids)):
            raise ValueError("A variant can only appear once in a quote")
        return self


class QuoteUpdateRequest(BaseModel):
    lead_id: str | None = Field(default=None, max_length=36)
    buyer_inquiry_id: str | None = Field(default=None, max_length=36)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    valid_until: date | None = None
    discount_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    tax_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    shipping_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=10000)
    terms: str | None = Field(default=None, max_length=10000)
    items: list[QuoteItemWrite] | None = Field(default=None, min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_items(self):
        if self.items is not None:
            variant_ids = [item.variant_id for item in self.items]
            if len(variant_ids) != len(set(variant_ids)):
                raise ValueError("A variant can only appear once in a quote")
        return self


class QuoteRevisionRequest(BaseModel):
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    valid_until: date | None = None
    discount_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    tax_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    shipping_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=10000)
    terms: str | None = Field(default=None, max_length=10000)
    items: list[QuoteItemWrite] | None = Field(default=None, min_length=1, max_length=500)

    @model_validator(mode="after")
    def validate_items(self):
        if self.items is not None:
            variant_ids = [item.variant_id for item in self.items]
            if len(variant_ids) != len(set(variant_ids)):
                raise ValueError("A variant can only appear once in a quote")
        return self


class QuoteDecisionRequest(BaseModel):
    decision_note: str = Field(default="", max_length=10000)


class QuoteAcceptRequest(BaseModel):
    order_number: str | None = Field(default=None, min_length=1, max_length=60)


class QuoteItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    variant_id: str
    sku_code: str
    product_name: str
    description: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    created_at: datetime


class QuoteVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    version_number: int
    status: str
    currency: str
    valid_until: date
    subtotal_amount: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    shipping_amount: Decimal
    total_amount: Decimal
    notes: str
    terms: str
    items_snapshot: list[dict]
    created_by: str
    created_at: datetime


class QuoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    lead_id: str | None
    buyer_inquiry_id: str | None
    order_id: str | None
    quote_number: str
    customer_name: str
    customer_email: str
    current_version: int
    status: str
    currency: str
    valid_until: date
    subtotal_amount: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    shipping_amount: Decimal
    total_amount: Decimal
    notes: str
    terms: str
    decision_note: str
    created_by: str
    sent_at: datetime | None
    responded_at: datetime | None
    items: list[QuoteItemResponse]
    versions: list[QuoteVersionResponse]
    created_at: datetime
    updated_at: datetime


class QuoteListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[QuoteResponse]


async def _load_quote(
    workspace_id: str,
    quote_id: str,
    session: SessionDep,
    *,
    for_update: bool = False,
) -> Quote:
    statement = (
        select(Quote)
        .where(Quote.id == quote_id, Quote.workspace_id == workspace_id)
        .options(selectinload(Quote.items), selectinload(Quote.versions))
        .execution_options(populate_existing=True)
    )
    if for_update:
        statement = statement.with_for_update()
    quote = await session.scalar(statement)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return quote


async def _validate_source(
    workspace_id: str,
    lead_id: str | None,
    buyer_inquiry_id: str | None,
    session: SessionDep,
) -> tuple[str, str]:
    if lead_id is None and buyer_inquiry_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A lead or assigned buyer inquiry is required",
        )

    lead = None
    if lead_id is not None:
        lead = await session.scalar(
            select(Lead).where(Lead.id == lead_id, Lead.workspace_id == workspace_id)
        )
        if lead is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    inquiry = None
    if buyer_inquiry_id is not None:
        inquiry = await session.scalar(
            select(BuyerInquiry).where(
                BuyerInquiry.id == buyer_inquiry_id,
                BuyerInquiry.assigned_workspace_id == workspace_id,
            )
        )
        if inquiry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Assigned buyer inquiry not found",
            )

    if lead is not None:
        return lead.company_name or lead.merchant_name, lead.email
    assert inquiry is not None
    return inquiry.company_name, inquiry.email


async def _build_items(
    workspace_id: str,
    payload: list[QuoteItemWrite],
    session: SessionDep,
) -> tuple[list[QuoteItem], Decimal]:
    variant_ids = [item.variant_id for item in payload]
    if len(variant_ids) != len(set(variant_ids)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A variant can only appear once in a quote",
        )
    rows = (
        await session.execute(
            select(ProductVariant, Product.name)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(
                ProductVariant.id.in_(variant_ids),
                ProductVariant.workspace_id == workspace_id,
                ProductVariant.is_deleted.is_(False),
                Product.is_deleted.is_(False),
            )
        )
    ).all()
    variants = {variant.id: (variant, product_name) for variant, product_name in rows}
    missing = sorted(set(variant_ids) - set(variants))
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "One or more variants were not found", "ids": missing},
        )

    items = []
    subtotal = Decimal("0")
    for requested in payload:
        variant, product_name = variants[requested.variant_id]
        line_total = Decimal(requested.quantity) * requested.unit_price
        if line_total > MAX_QUOTE_AMOUNT or subtotal + line_total > MAX_QUOTE_AMOUNT:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Quote amount exceeds the supported limit",
            )
        subtotal += line_total
        items.append(
            QuoteItem(
                id=new_id(),
                variant_id=variant.id,
                sku_code=variant.sku_code,
                product_name=product_name,
                description=requested.description,
                quantity=requested.quantity,
                unit_price=requested.unit_price,
                line_total=line_total,
            )
        )
    return items, subtotal


def _snapshot_items(items: list[QuoteItem]) -> list[dict]:
    return [
        {
            "variant_id": item.variant_id,
            "sku_code": item.sku_code,
            "product_name": item.product_name,
            "description": item.description,
            "quantity": item.quantity,
            "unit_price": str(item.unit_price),
            "line_total": str(item.line_total),
        }
        for item in items
    ]


def _recalculate(quote: Quote, subtotal: Decimal | None = None) -> None:
    if subtotal is not None:
        quote.subtotal_amount = subtotal
    total = quote.subtotal_amount - quote.discount_amount + quote.tax_amount + quote.shipping_amount
    if total < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Discount cannot exceed the quote subtotal plus charges",
        )
    if total > MAX_QUOTE_AMOUNT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Quote amount exceeds the supported limit",
        )
    quote.total_amount = total


def _new_version(quote: Quote, actor: str) -> QuoteVersion:
    return QuoteVersion(
        id=new_id(),
        version_number=quote.current_version,
        status=quote.status,
        currency=quote.currency,
        valid_until=quote.valid_until,
        subtotal_amount=quote.subtotal_amount,
        discount_amount=quote.discount_amount,
        tax_amount=quote.tax_amount,
        shipping_amount=quote.shipping_amount,
        total_amount=quote.total_amount,
        notes=quote.notes,
        terms=quote.terms,
        items_snapshot=_snapshot_items(quote.items),
        created_by=actor,
    )


def _current_version(quote: Quote) -> QuoteVersion:
    for version in quote.versions:
        if version.version_number == quote.current_version:
            return version
    raise RuntimeError("Quote current version is missing")


def _sync_current_version(quote: Quote) -> None:
    version = _current_version(quote)
    version.status = quote.status
    version.currency = quote.currency
    version.valid_until = quote.valid_until
    version.subtotal_amount = quote.subtotal_amount
    version.discount_amount = quote.discount_amount
    version.tax_amount = quote.tax_amount
    version.shipping_amount = quote.shipping_amount
    version.total_amount = quote.total_amount
    version.notes = quote.notes
    version.terms = quote.terms
    version.items_snapshot = _snapshot_items(quote.items)


def _validate_validity(valid_until: date) -> None:
    if valid_until < date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Quote validity cannot be in the past",
        )


@router.get("", response_model=QuoteListResponse)
async def list_quotes(
    context: WorkspaceDep,
    session: SessionDep,
    quote_status: Annotated[QuoteStatus | None, Query(alias="status")] = None,
    lead_id: str | None = None,
    buyer_inquiry_id: str | None = None,
    search: str | None = None,
    ordering: Literal["created_at", "-created_at", "valid_until", "-valid_until"] = "-created_at",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> QuoteListResponse:
    filters = [Quote.workspace_id == context.workspace.id]
    if quote_status:
        filters.append(Quote.status == quote_status)
    if lead_id:
        filters.append(Quote.lead_id == lead_id)
    if buyer_inquiry_id:
        filters.append(Quote.buyer_inquiry_id == buyer_inquiry_id)
    if search:
        term = f"%{search.strip()}%"
        filters.append(or_(Quote.quote_number.ilike(term), Quote.customer_name.ilike(term)))
    ordering_map = {
        "created_at": Quote.created_at.asc(),
        "-created_at": Quote.created_at.desc(),
        "valid_until": Quote.valid_until.asc(),
        "-valid_until": Quote.valid_until.desc(),
    }
    total = await session.scalar(select(func.count()).select_from(Quote).where(*filters))
    items = (
        (
            await session.scalars(
                select(Quote)
                .where(*filters)
                .options(selectinload(Quote.items), selectinload(Quote.versions))
                .order_by(ordering_map[ordering])
                .limit(limit)
                .offset(offset)
            )
        )
        .unique()
        .all()
    )
    return QuoteListResponse(total=total or 0, limit=limit, offset=offset, items=list(items))


@router.post("", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
async def create_quote(
    payload: QuoteCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Quote:
    _validate_validity(payload.valid_until)
    customer_name, customer_email = await _validate_source(
        context.workspace.id,
        payload.lead_id,
        payload.buyer_inquiry_id,
        session,
    )
    items, subtotal = await _build_items(context.workspace.id, payload.items, session)
    quote = Quote(
        id=new_id(),
        workspace_id=context.workspace.id,
        lead_id=payload.lead_id,
        buyer_inquiry_id=payload.buyer_inquiry_id,
        quote_number=payload.quote_number or f"Q-{new_id()[:12].upper()}",
        customer_name=customer_name,
        customer_email=customer_email,
        current_version=1,
        status="draft",
        currency=payload.currency,
        valid_until=payload.valid_until,
        subtotal_amount=subtotal,
        discount_amount=payload.discount_amount,
        tax_amount=payload.tax_amount,
        shipping_amount=payload.shipping_amount,
        notes=payload.notes,
        terms=payload.terms,
        created_by=context.user.username,
        items=items,
    )
    _recalculate(quote)
    quote.versions.append(_new_version(quote, context.user.username))
    session.add(quote)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="quote.created",
        entity_type="quote",
        entity_id=quote.id,
        payload={"quote_number": quote.quote_number, "version": 1},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Quote number already exists",
        ) from exc
    return await _load_quote(context.workspace.id, quote.id, session)


@router.get("/{quote_id}", response_model=QuoteResponse)
async def get_quote(
    quote_id: str,
    context: WorkspaceDep,
    session: SessionDep,
) -> Quote:
    return await _load_quote(context.workspace.id, quote_id, session)


@router.patch("/{quote_id}", response_model=QuoteResponse)
async def update_quote(
    quote_id: str,
    payload: QuoteUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Quote:
    quote = await _load_quote(context.workspace.id, quote_id, session, for_update=True)
    if quote.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a draft quote can be updated",
        )
    changes = payload.model_dump(exclude_unset=True, exclude={"items"})
    item_payload = payload.items if "items" in payload.model_fields_set else None
    lead_id = changes.get("lead_id", quote.lead_id)
    buyer_inquiry_id = changes.get("buyer_inquiry_id", quote.buyer_inquiry_id)
    if "lead_id" in changes or "buyer_inquiry_id" in changes:
        quote.customer_name, quote.customer_email = await _validate_source(
            context.workspace.id,
            lead_id,
            buyer_inquiry_id,
            session,
        )
    for field_name, value in changes.items():
        setattr(quote, field_name, value)
    _validate_validity(quote.valid_until)
    subtotal = None
    if item_payload is not None:
        items, subtotal = await _build_items(context.workspace.id, item_payload, session)
        quote.items = items
    _recalculate(quote, subtotal)
    _sync_current_version(quote)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="quote.updated",
        entity_type="quote",
        entity_id=quote.id,
        payload={"fields": sorted(changes | ({"items": item_payload} if item_payload else {}))},
    )
    await session.commit()
    return await _load_quote(context.workspace.id, quote.id, session)


@router.post("/{quote_id}/send", response_model=QuoteResponse)
async def send_quote(
    quote_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Quote:
    quote = await _load_quote(context.workspace.id, quote_id, session, for_update=True)
    if quote.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a draft quote can be sent",
        )
    _validate_validity(quote.valid_until)
    quote.status = "sent"
    quote.sent_at = datetime.now(UTC)
    version = _current_version(quote)
    version.status = "sent"
    if quote.lead_id is not None:
        lead = await session.scalar(
            select(Lead).where(
                Lead.id == quote.lead_id,
                Lead.workspace_id == context.workspace.id,
            )
        )
        if lead is not None and lead.stage == "qualified":
            lead.stage = "quoting"
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="quote.sent",
        entity_type="quote",
        entity_id=quote.id,
        payload={"version": quote.current_version},
    )
    await session.commit()
    return await _load_quote(context.workspace.id, quote.id, session)


@router.post("/{quote_id}/revise", response_model=QuoteResponse)
async def revise_quote(
    quote_id: str,
    payload: QuoteRevisionRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Quote:
    quote = await _load_quote(context.workspace.id, quote_id, session, for_update=True)
    if quote.status not in {"sent", "rejected", "expired"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a sent, rejected, or expired quote can be revised",
        )
    previous_version = _current_version(quote)
    previous_version.status = "superseded"
    changes = payload.model_dump(exclude_unset=True, exclude={"items"})
    item_payload = payload.items if "items" in payload.model_fields_set else None
    for field_name, value in changes.items():
        setattr(quote, field_name, value)
    _validate_validity(quote.valid_until)
    subtotal = None
    if item_payload is not None:
        items, subtotal = await _build_items(context.workspace.id, item_payload, session)
        quote.items = items
    quote.current_version += 1
    quote.status = "draft"
    quote.sent_at = None
    quote.responded_at = None
    quote.decision_note = ""
    _recalculate(quote, subtotal)
    quote.versions.append(_new_version(quote, context.user.username))
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="quote.revised",
        entity_type="quote",
        entity_id=quote.id,
        payload={"from_version": quote.current_version - 1, "to_version": quote.current_version},
    )
    await session.commit()
    return await _load_quote(context.workspace.id, quote.id, session)


@router.post("/{quote_id}/reject", response_model=QuoteResponse)
async def reject_quote(
    quote_id: str,
    payload: QuoteDecisionRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Quote:
    quote = await _load_quote(context.workspace.id, quote_id, session, for_update=True)
    if quote.status != "sent":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a sent quote can be rejected",
        )
    quote.status = "rejected"
    quote.decision_note = payload.decision_note
    quote.responded_at = datetime.now(UTC)
    _current_version(quote).status = "rejected"
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="quote.rejected",
        entity_type="quote",
        entity_id=quote.id,
        payload={"version": quote.current_version},
    )
    await session.commit()
    return await _load_quote(context.workspace.id, quote.id, session)


@router.post("/{quote_id}/accept", response_model=QuoteResponse)
async def accept_quote(
    quote_id: str,
    payload: QuoteAcceptRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> Quote:
    canonical_request = json.dumps(
        payload.model_dump(mode="json"),
        sort_keys=True,
        separators=(",", ":"),
    )
    request_hash = hashlib.sha256(canonical_request.encode()).hexdigest()
    scope = f"quote.accept:{quote_id}"
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
        return await _load_quote(context.workspace.id, quote_id, session)

    quote = await _load_quote(context.workspace.id, quote_id, session, for_update=True)
    if quote.status != "sent":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only a sent quote can be accepted",
        )
    if quote.valid_until < date.today():
        quote.status = "expired"
        _current_version(quote).status = "expired"
        record_audit(
            session,
            workspace_id=context.workspace.id,
            actor_user_id=context.user.id,
            action="quote.expired",
            entity_type="quote",
            entity_id=quote.id,
            payload={"valid_until": quote.valid_until.isoformat()},
        )
        await session.commit()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Quote has expired")

    variant_ids = [item.variant_id for item in quote.items]
    orderable_ids = set(
        await session.scalars(
            select(ProductVariant.id).where(
                ProductVariant.id.in_(variant_ids),
                ProductVariant.workspace_id == context.workspace.id,
                ProductVariant.is_deleted.is_(False),
            )
        )
    )
    if orderable_ids != set(variant_ids):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="One or more quoted variants are no longer available",
        )

    order_number = payload.order_number or f"ORD-{quote.quote_number}"
    duplicate_order = await session.scalar(
        select(Order.id).where(
            Order.workspace_id == context.workspace.id,
            Order.order_number == order_number,
        )
    )
    if duplicate_order is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order number already exists",
        )
    lead = None
    if quote.lead_id is not None:
        lead = await session.scalar(
            select(Lead).where(
                Lead.id == quote.lead_id,
                Lead.workspace_id == context.workspace.id,
            )
        )

    order = Order(
        id=new_id(),
        workspace_id=context.workspace.id,
        lead_id=quote.lead_id,
        order_number=order_number,
        total_amount=quote.total_amount,
        currency=quote.currency,
        order_status="pending",
        payment_status="unpaid",
    )
    order.items = [
        OrderItem(
            id=new_id(),
            variant_id=item.variant_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
        )
        for item in quote.items
    ]
    session.add(order)
    quote.order_id = order.id
    quote.status = "accepted"
    quote.responded_at = datetime.now(UTC)
    quote.decision_note = ""
    _current_version(quote).status = "accepted"
    if lead is not None and lead.stage == "quoting":
        lead.stage = "ordered"
    session.add(
        IdempotencyRecord(
            workspace_id=context.workspace.id,
            scope=scope,
            key=idempotency_key,
            request_hash=request_hash,
            response_payload={"quote_id": quote.id, "order_id": order.id},
        )
    )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="quote.accepted",
        entity_type="quote",
        entity_id=quote.id,
        payload={"version": quote.current_version, "order_id": order.id},
    )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="order.created_from_quote",
        entity_type="order",
        entity_id=order.id,
        payload={"quote_id": quote.id, "quote_number": quote.quote_number},
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
            return await _load_quote(context.workspace.id, quote_id, session)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order number already exists or quote acceptance was claimed",
        ) from exc
    return await _load_quote(context.workspace.id, quote.id, session)
