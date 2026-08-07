import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.core.audit import record_audit
from app.core.dependencies import SessionDep, WorkspaceDep, WorkspaceWriteDep
from app.core.models import (
    IdempotencyRecord,
    Lead,
    Order,
    OrderItem,
    ProductVariant,
    Shipping,
    new_id,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/orders", tags=["orders"])

OrderStatus = Literal["pending", "confirmed", "in_fulfillment", "completed", "cancelled"]
PaymentStatus = Literal["unpaid", "partial", "paid"]
ShippingStatus = Literal["pending", "shipped", "delivered"]

ORDER_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"in_fulfillment", "cancelled"},
    "in_fulfillment": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}
PAYMENT_TRANSITIONS: dict[str, set[str]] = {
    "unpaid": {"partial", "paid"},
    "partial": {"paid"},
    "paid": set(),
}
SHIPPING_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"shipped"},
    "shipped": {"delivered"},
    "delivered": set(),
}


class OrderItemWrite(BaseModel):
    variant_id: str = Field(min_length=1, max_length=36)
    quantity: int = Field(ge=1, le=1_000_000_000)
    unit_price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class OrderCreateRequest(BaseModel):
    order_number: str | None = Field(default=None, min_length=1, max_length=60)
    lead_id: str | None = Field(default=None, max_length=36)
    currency: str = Field(default="USD", pattern=r"^[A-Z]{3}$")
    items: list[OrderItemWrite] = Field(min_length=1, max_length=500)


class OrderUpdateRequest(BaseModel):
    order_status: OrderStatus | None = None
    payment_status: PaymentStatus | None = None


class OrderItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    variant_id: str
    quantity: int
    unit_price: Decimal
    created_at: datetime


class ShippingCreateRequest(BaseModel):
    carrier: str = Field(default="", max_length=100)
    tracking_number: str = Field(default="", max_length=100)
    shipping_status: ShippingStatus = "pending"
    shipped_at: datetime | None = None
    notes: str = Field(default="", max_length=10000)


class ShippingUpdateRequest(BaseModel):
    carrier: str | None = Field(default=None, max_length=100)
    tracking_number: str | None = Field(default=None, max_length=100)
    shipping_status: ShippingStatus | None = None
    shipped_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=10000)


class ShippingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_id: str
    carrier: str
    tracking_number: str
    shipped_at: datetime | None
    shipping_status: str
    notes: str
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime


class OrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    lead_id: str | None
    order_number: str
    total_amount: Decimal
    currency: str
    order_status: str
    payment_status: str
    items: list[OrderItemResponse]
    shipments: list[ShippingResponse]
    created_at: datetime
    updated_at: datetime


class OrderListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[OrderResponse]


async def _load_order(workspace_id: str, order_id: str, session: SessionDep) -> Order:
    order = await session.scalar(
        select(Order)
        .where(Order.id == order_id, Order.workspace_id == workspace_id)
        .options(selectinload(Order.items), selectinload(Order.shipments))
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


async def _validated_items(
    workspace_id: str,
    payload: list[OrderItemWrite],
    session: SessionDep,
) -> tuple[list[OrderItem], Decimal]:
    variant_ids = [item.variant_id for item in payload]
    variants = set(
        await session.scalars(
            select(ProductVariant.id).where(
                ProductVariant.id.in_(variant_ids),
                ProductVariant.workspace_id == workspace_id,
                ProductVariant.is_deleted.is_(False),
            )
        )
    )
    missing = sorted(set(variant_ids) - variants)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"message": "One or more variants were not found", "ids": missing},
        )
    items = [
        OrderItem(
            id=new_id(),
            variant_id=item.variant_id,
            quantity=item.quantity,
            unit_price=item.unit_price,
        )
        for item in payload
    ]
    total = sum(
        (Decimal(item.quantity) * item.unit_price for item in payload),
        start=Decimal("0"),
    )
    return items, total


@router.get("", response_model=OrderListResponse)
async def list_orders(
    context: WorkspaceDep,
    session: SessionDep,
    order_status: Annotated[OrderStatus | None, Query(alias="status")] = None,
    payment_status: PaymentStatus | None = None,
    lead_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> OrderListResponse:
    filters = [Order.workspace_id == context.workspace.id]
    if order_status:
        filters.append(Order.order_status == order_status)
    if payment_status:
        filters.append(Order.payment_status == payment_status)
    if lead_id:
        filters.append(Order.lead_id == lead_id)
    total = await session.scalar(select(func.count()).select_from(Order).where(*filters))
    items = (
        (
            await session.scalars(
                select(Order)
                .where(*filters)
                .options(selectinload(Order.items), selectinload(Order.shipments))
                .order_by(Order.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        )
        .unique()
        .all()
    )
    return OrderListResponse(total=total or 0, limit=limit, offset=offset, items=list(items))


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
) -> Order:
    canonical_request = json.dumps(
        payload.model_dump(mode="json"),
        sort_keys=True,
        separators=(",", ":"),
    )
    request_hash = hashlib.sha256(canonical_request.encode()).hexdigest()
    scope = "order.create"
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
        return await _load_order(
            context.workspace.id,
            existing.response_payload["order_id"],
            session,
        )

    if payload.lead_id is not None:
        lead = await session.scalar(
            select(Lead).where(
                Lead.id == payload.lead_id,
                Lead.workspace_id == context.workspace.id,
            )
        )
        if lead is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    items, total = await _validated_items(context.workspace.id, payload.items, session)
    order = Order(
        id=new_id(),
        workspace_id=context.workspace.id,
        lead_id=payload.lead_id,
        order_number=payload.order_number or f"ORD-{new_id()[:12].upper()}",
        total_amount=total,
        currency=payload.currency,
    )
    order.items = items
    session.add(order)
    session.add(
        IdempotencyRecord(
            workspace_id=context.workspace.id,
            scope=scope,
            key=idempotency_key,
            request_hash=request_hash,
            response_payload={"order_id": order.id},
        )
    )
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="order.created",
        entity_type="order",
        entity_id=order.id,
        payload={"order_number": order.order_number, "item_count": len(items)},
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
            return await _load_order(
                context.workspace.id,
                concurrent.response_payload["order_id"],
                session,
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order number already exists or idempotency key was claimed",
        ) from exc
    return await _load_order(context.workspace.id, order.id, session)


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
    order_id: str,
    context: WorkspaceDep,
    session: SessionDep,
) -> Order:
    return await _load_order(context.workspace.id, order_id, session)


@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order_status(
    order_id: str,
    payload: OrderUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Order:
    order = await _load_order(context.workspace.id, order_id, session)
    changes = payload.model_dump(exclude_unset=True)
    requested_order_status = changes.get("order_status")
    requested_payment_status = changes.get("payment_status")
    if (
        requested_order_status is not None
        and requested_order_status != order.order_status
        and requested_order_status not in ORDER_TRANSITIONS.get(order.order_status, set())
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Order cannot transition from {order.order_status} to {requested_order_status}",
        )
    if (
        requested_payment_status is not None
        and requested_payment_status != order.payment_status
        and requested_payment_status not in PAYMENT_TRANSITIONS.get(order.payment_status, set())
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Payment cannot transition from {order.payment_status} "
                f"to {requested_payment_status}"
            ),
        )
    for field_name, value in changes.items():
        setattr(order, field_name, value)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="order.status_updated",
        entity_type="order",
        entity_id=order.id,
        payload=changes,
    )
    await session.commit()
    return await _load_order(context.workspace.id, order.id, session)


@router.put("/{order_id}/items", response_model=OrderResponse)
async def replace_order_items(
    order_id: str,
    payload: Annotated[list[OrderItemWrite], Field(min_length=1, max_length=500)],
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Order:
    order = await _load_order(context.workspace.id, order_id, session)
    if order.order_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order items can only be changed while an order is pending",
        )
    items, total = await _validated_items(context.workspace.id, payload, session)
    await session.execute(delete(OrderItem).where(OrderItem.order_id == order.id))
    for item in items:
        item.order_id = order.id
    session.add_all(items)
    order.total_amount = total
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="order.items_replaced",
        entity_type="order",
        entity_id=order.id,
        payload={"item_count": len(items), "total_amount": str(total)},
    )
    await session.commit()
    return await _load_order(context.workspace.id, order.id, session)


@router.post(
    "/{order_id}/shipments",
    response_model=ShippingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_shipment(
    order_id: str,
    payload: ShippingCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Shipping:
    order = await _load_order(context.workspace.id, order_id, session)
    if order.order_status in {"completed", "cancelled"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A shipment cannot be added to a closed order",
        )
    shipped_at = payload.shipped_at
    if payload.shipping_status in {"shipped", "delivered"} and shipped_at is None:
        shipped_at = datetime.now(UTC)
    shipment = Shipping(
        id=new_id(),
        workspace_id=context.workspace.id,
        order_id=order.id,
        carrier=payload.carrier,
        tracking_number=payload.tracking_number,
        shipped_at=shipped_at,
        shipping_status=payload.shipping_status,
        notes=payload.notes,
        created_by=context.user.username,
        updated_by=context.user.username,
    )
    session.add(shipment)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="shipping.created",
        entity_type="shipping",
        entity_id=shipment.id,
        payload={"order_id": order.id, "tracking_number": shipment.tracking_number},
    )
    await session.commit()
    return shipment


@router.patch("/{order_id}/shipments/{shipment_id}", response_model=ShippingResponse)
async def update_shipment(
    order_id: str,
    shipment_id: str,
    payload: ShippingUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Shipping:
    await _load_order(context.workspace.id, order_id, session)
    shipment = await session.scalar(
        select(Shipping).where(
            Shipping.id == shipment_id,
            Shipping.order_id == order_id,
            Shipping.workspace_id == context.workspace.id,
        )
    )
    if shipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")
    changes = payload.model_dump(exclude_unset=True)
    requested_status = changes.get("shipping_status")
    if (
        requested_status is not None
        and requested_status != shipment.shipping_status
        and requested_status not in SHIPPING_TRANSITIONS.get(shipment.shipping_status, set())
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Shipment cannot transition from {shipment.shipping_status} to {requested_status}"
            ),
        )
    if requested_status in {"shipped", "delivered"} and "shipped_at" not in changes:
        changes["shipped_at"] = shipment.shipped_at or datetime.now(UTC)
    for field_name, value in changes.items():
        setattr(shipment, field_name, value)
    shipment.updated_by = context.user.username
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="shipping.updated",
        entity_type="shipping",
        entity_id=shipment.id,
        payload={"fields": sorted(changes)},
    )
    await session.commit()
    return shipment
