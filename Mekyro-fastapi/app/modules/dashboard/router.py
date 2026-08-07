from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import case, func, select

from app.core.dependencies import SessionDep, WorkspaceDep
from app.core.models import ContactActivity, Lead, Order, Product, ProductVariant, Quote

router = APIRouter(prefix="/workspaces/{workspace_id}/dashboard", tags=["dashboard"])


class RecentLeadResponse(BaseModel):
    id: str
    merchant_name: str
    company_name: str
    country: str
    stage: str
    score: int


class CountryLeadCountResponse(BaseModel):
    country: str
    count: int


class DashboardLeadResponse(BaseModel):
    total: int
    new: int
    contacting: int
    qualified: int
    converted: int
    high_score: int
    with_phone: int
    with_email: int
    with_whatsapp: int
    score_high: int
    score_mid: int
    score_low: int
    activities: int
    contact_log_total: int
    recent: list[RecentLeadResponse]
    countries: list[CountryLeadCountResponse]


class DashboardCatalogResponse(BaseModel):
    products: int
    variants: int
    stock_quantity: int
    out_of_stock_variants: int


class DashboardQuoteResponse(BaseModel):
    total: int
    draft: int
    sent: int
    accepted: int
    rejected: int
    conversion_rate: str


class DashboardOrderResponse(BaseModel):
    total: int
    pending: int
    fulfilling: int
    completed: int
    total_amount: str


class DashboardResponse(BaseModel):
    leads: DashboardLeadResponse
    catalog: DashboardCatalogResponse
    quotes: DashboardQuoteResponse
    orders: DashboardOrderResponse


@router.get("", response_model=DashboardResponse)
async def get_dashboard(context: WorkspaceDep, session: SessionDep) -> DashboardResponse:
    workspace_id = context.workspace.id
    lead_row = (
        await session.execute(
            select(
                func.count(Lead.id),
                func.sum(case((Lead.stage == "new", 1), else_=0)),
                func.sum(case((Lead.stage.in_(["contacting", "replied"]), 1), else_=0)),
                func.sum(case((Lead.stage.in_(["qualified", "quoting"]), 1), else_=0)),
                func.sum(case((Lead.stage == "ordered", 1), else_=0)),
                func.sum(case((Lead.recommendation_score >= 70, 1), else_=0)),
                func.sum(case((Lead.phone != "", 1), else_=0)),
                func.sum(case((Lead.email != "", 1), else_=0)),
                func.sum(case((Lead.whatsapp != "", 1), else_=0)),
                func.sum(case((Lead.recommendation_score >= 80, 1), else_=0)),
                func.sum(
                    case(
                        (
                            Lead.recommendation_score.between(50, 79),
                            1,
                        ),
                        else_=0,
                    )
                ),
                func.sum(case((Lead.recommendation_score < 50, 1), else_=0)),
            ).where(Lead.workspace_id == workspace_id)
        )
    ).one()
    contact_total = await session.scalar(
        select(func.count(ContactActivity.id)).where(ContactActivity.workspace_id == workspace_id)
    )
    recent_leads = (
        await session.execute(
            select(
                Lead.id,
                Lead.merchant_name,
                Lead.company_name,
                Lead.country,
                Lead.stage,
                Lead.recommendation_score,
            )
            .where(Lead.workspace_id == workspace_id)
            .order_by(Lead.created_at.desc(), Lead.id.desc())
            .limit(5)
        )
    ).all()
    country_count = func.count(Lead.id)
    countries = (
        await session.execute(
            select(Lead.country, country_count.label("count"))
            .where(Lead.workspace_id == workspace_id)
            .group_by(Lead.country)
            .order_by(country_count.desc(), Lead.country.asc())
            .limit(5)
        )
    ).all()
    product_total = await session.scalar(
        select(func.count(Product.id)).where(
            Product.workspace_id == workspace_id,
            Product.is_deleted.is_(False),
        )
    )
    variant_row = (
        await session.execute(
            select(
                func.count(ProductVariant.id),
                func.sum(ProductVariant.stock_quantity),
                func.sum(case((ProductVariant.stock_quantity == 0, 1), else_=0)),
            ).where(
                ProductVariant.workspace_id == workspace_id,
                ProductVariant.is_deleted.is_(False),
            )
        )
    ).one()
    order_row = (
        await session.execute(
            select(
                func.count(Order.id),
                func.sum(case((Order.order_status == "pending", 1), else_=0)),
                func.sum(
                    case((Order.order_status.in_(["confirmed", "in_fulfillment"]), 1), else_=0)
                ),
                func.sum(case((Order.order_status == "completed", 1), else_=0)),
                func.sum(Order.total_amount),
            ).where(Order.workspace_id == workspace_id)
        )
    ).one()
    quote_row = (
        await session.execute(
            select(
                func.count(Quote.id),
                func.sum(case((Quote.status == "draft", 1), else_=0)),
                func.sum(case((Quote.status == "sent", 1), else_=0)),
                func.sum(case((Quote.status == "accepted", 1), else_=0)),
                func.sum(case((Quote.status == "rejected", 1), else_=0)),
                func.sum(
                    case(
                        (Quote.status.in_(["sent", "accepted", "rejected", "expired"]), 1), else_=0
                    )
                ),
            ).where(Quote.workspace_id == workspace_id)
        )
    ).one()
    issued_quotes = quote_row[5] or 0
    accepted_quotes = quote_row[3] or 0
    quote_conversion_rate = (
        (Decimal(accepted_quotes) * Decimal("100") / Decimal(issued_quotes)).quantize(
            Decimal("0.01")
        )
        if issued_quotes
        else Decimal("0.00")
    )

    return DashboardResponse(
        leads={
            "total": lead_row[0] or 0,
            "new": lead_row[1] or 0,
            "contacting": lead_row[2] or 0,
            "qualified": lead_row[3] or 0,
            "converted": lead_row[4] or 0,
            "high_score": lead_row[5] or 0,
            "with_phone": lead_row[6] or 0,
            "with_email": lead_row[7] or 0,
            "with_whatsapp": lead_row[8] or 0,
            "score_high": lead_row[9] or 0,
            "score_mid": lead_row[10] or 0,
            "score_low": lead_row[11] or 0,
            "activities": contact_total or 0,
            "contact_log_total": contact_total or 0,
            "recent": [
                {
                    "id": row.id,
                    "merchant_name": row.merchant_name,
                    "company_name": row.company_name,
                    "country": row.country,
                    "stage": row.stage,
                    "score": row.recommendation_score,
                }
                for row in recent_leads
            ],
            "countries": [
                {"country": row.country, "count": row.count} for row in countries
            ],
        },
        catalog={
            "products": product_total or 0,
            "variants": variant_row[0] or 0,
            "stock_quantity": variant_row[1] or 0,
            "out_of_stock_variants": variant_row[2] or 0,
        },
        quotes={
            "total": quote_row[0] or 0,
            "draft": quote_row[1] or 0,
            "sent": quote_row[2] or 0,
            "accepted": accepted_quotes,
            "rejected": quote_row[4] or 0,
            "conversion_rate": str(quote_conversion_rate),
        },
        orders={
            "total": order_row[0] or 0,
            "pending": order_row[1] or 0,
            "fulfilling": order_row[2] or 0,
            "completed": order_row[3] or 0,
            "total_amount": str(order_row[4] or Decimal("0")),
        },
    )
