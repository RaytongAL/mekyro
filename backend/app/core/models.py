from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_id() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(UTC)


def default_onboarding_state() -> dict:
    return {
        "schema_version": 5,
        "status": "not_started",
        "current_step": "profile",
        "lead_acquisition_requirement": "",
        "completion_acknowledged": False,
        "steps": {
            step: {
                "status": "pending",
                "answers": {},
                "pending_card": None,
                "execution": None,
                "applied_count": 0,
                "recent_applied_items": [],
            }
            for step in ("profile", "site", "leads")
        },
    }


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(150), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(150), default="")
    nickname: Mapped[str] = mapped_column(String(150), default="")
    country_code: Mapped[str] = mapped_column(String(10), default="+86")
    phone: Mapped[str] = mapped_column(String(30), default="", index=True)
    avatar: Mapped[str] = mapped_column(String(500), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    language: Mapped[str] = mapped_column(String(10), default="zh-CN")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    memberships: Mapped[list["WorkspaceMember"]] = relationship(back_populates="user")


class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    site_type: Mapped[str] = mapped_column(String(30), default="none")
    lead_acquisition_requirement: Mapped[str] = mapped_column(Text, default="")
    prompt: Mapped[str] = mapped_column(Text, default="")
    prompt_version: Mapped[int] = mapped_column(Integer, default=1)
    daily_lead_limit: Mapped[int] = mapped_column(Integer, default=0)
    email_outreach_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    vendure_channels_token: Mapped[str] = mapped_column(String(255), default="")
    vendure_url: Mapped[str] = mapped_column(String(500), default="")
    onboarding_state: Mapped[dict] = mapped_column(JSON, default=default_onboarding_state)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    members: Mapped[list["WorkspaceMember"]] = relationship(back_populates="workspace")


class WorkspaceMember(Base, TimestampMixin):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(150), default="")
    role: Mapped[str] = mapped_column(String(30), default="member")

    workspace: Mapped[Workspace] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class ApiKey(Base, TimestampMixin):
    """Hashed external API credential scoped to one Workspace."""

    __tablename__ = "api_keys"
    __table_args__ = (
        UniqueConstraint("key_hash"),
        Index("idx_api_key_workspace_active", "workspace_id", "is_active"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100))
    key_hash: Mapped[str] = mapped_column(String(64))
    key_prefix: Mapped[str] = mapped_column(String(12))
    permissions: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship()
    workspace: Mapped[Workspace] = relationship()


class AuthChallenge(Base):
    __tablename__ = "auth_challenges"
    __table_args__ = (
        Index("idx_auth_challenge_target_created", "channel", "target", "created_at"),
        Index("idx_auth_challenge_ip_created", "ip_address", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    channel: Mapped[str] = mapped_column(String(20), index=True)
    target: Mapped[str] = mapped_column(String(254), index=True)
    purpose: Mapped[str] = mapped_column(String(30), default="login")
    code_hash: Mapped[str] = mapped_column(String(64))
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    captcha_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ShopifyConfig(Base, TimestampMixin):
    __tablename__ = "shopify_configs"
    __table_args__ = (UniqueConstraint("workspace_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    store_url: Mapped[str] = mapped_column(String(500), default="")
    api_version: Mapped[str] = mapped_column(String(20), default="2026-04")
    api_key_encrypted: Mapped[str] = mapped_column(Text, default="")
    api_secret_encrypted: Mapped[str] = mapped_column(Text, default="")
    grant_type: Mapped[str] = mapped_column(String(50), default="client_credentials")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    workspace: Mapped[Workspace] = relationship()

    @property
    def is_ready(self) -> bool:
        return bool(
            self.is_active
            and self.store_url
            and self.api_key_encrypted
            and self.api_secret_encrypted
        )


class OutboxMessage(Base):
    __tablename__ = "outbox_messages"
    __table_args__ = (
        UniqueConstraint("deduplication_key"),
        Index("idx_outbox_status_available", "status", "available_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    topic: Mapped[str] = mapped_column(String(100), index=True)
    aggregate_type: Mapped[str] = mapped_column(String(80))
    aggregate_id: Mapped[str] = mapped_column(String(36))
    deduplication_key: Mapped[str] = mapped_column(String(200))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkspacePromptVersion(Base):
    __tablename__ = "workspace_prompt_versions"
    __table_args__ = (UniqueConstraint("workspace_id", "version"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    prompt: Mapped[str] = mapped_column(Text)
    daily_lead_limit: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkspaceInvitation(Base, TimestampMixin):
    __tablename__ = "workspace_invitations"
    __table_args__ = (
        UniqueConstraint("token_hash"),
        Index("idx_workspace_invitation_workspace_status", "workspace_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(254), index=True)
    role: Mapped[str] = mapped_column(String(30), default="member")
    token_prefix: Mapped[str] = mapped_column(String(20))
    token_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(30), default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    invited_by: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    accepted_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Lead(Base, TimestampMixin):
    __tablename__ = "leads"
    __table_args__ = (
        UniqueConstraint("workspace_id", "source", "external_ref"),
        Index("idx_lead_workspace_stage", "workspace_id", "stage"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[str] = mapped_column(String(30), default="manual")
    external_ref: Mapped[str] = mapped_column(String(120))
    merchant_name: Mapped[str] = mapped_column(String(200))
    company_name: Mapped[str] = mapped_column(String(200))
    contact_person: Mapped[str] = mapped_column(String(150), default="")
    country: Mapped[str] = mapped_column(String(5))
    city: Mapped[str] = mapped_column(String(100), default="")
    zip_code: Mapped[str] = mapped_column(String(20), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    email: Mapped[str] = mapped_column(String(254), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    country_code: Mapped[str] = mapped_column(String(10), default="")
    whatsapp: Mapped[str] = mapped_column(String(50), default="")
    stage: Mapped[str] = mapped_column(String(30), default="new")
    recommendation_score: Mapped[int] = mapped_column(Integer, default=0)
    recommendation_reason: Mapped[str] = mapped_column(Text, default="")

    activities: Mapped[list["ContactActivity"]] = relationship(back_populates="lead")


class ContactActivity(Base):
    __tablename__ = "contact_activities"
    __table_args__ = (Index("idx_activity_workspace_created", "workspace_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    lead_id: Mapped[str] = mapped_column(ForeignKey("leads.id", ondelete="CASCADE"), index=True)
    activity_type: Mapped[str] = mapped_column(String(30), default="human_outbound")
    direction: Mapped[str] = mapped_column(String(30))
    channel: Mapped[str] = mapped_column(String(30))
    subject: Mapped[str] = mapped_column(String(500), default="")
    sender: Mapped[str] = mapped_column(String(254), default="")
    recipient: Mapped[str] = mapped_column(String(254), default="")
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    lead: Mapped[Lead] = relationship(back_populates="activities")


class Category(Base, TimestampMixin):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("workspace_id", "parent_id", "name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Product(Base, TimestampMixin):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[str | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    specification_template: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(30), default="active")
    external_ids: Mapped[dict] = mapped_column(JSON, default=dict)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    variants: Mapped[list["ProductVariant"]] = relationship(back_populates="product")
    images: Mapped[list["ProductImage"]] = relationship(back_populates="product")


class ProductVariant(Base, TimestampMixin):
    __tablename__ = "product_variants"
    __table_args__ = (UniqueConstraint("workspace_id", "sku_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[str] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    sku_code: Mapped[str] = mapped_column(String(100))
    specifications: Mapped[dict] = mapped_column(JSON, default=dict)
    minimum_order_quantity: Mapped[int] = mapped_column(Integer, default=1)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30), default="active")
    external_ids: Mapped[dict] = mapped_column(JSON, default=dict)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    product: Mapped[Product] = relationship(back_populates="variants")
    price_tiers: Mapped[list["PriceTier"]] = relationship(back_populates="variant")
    images: Mapped[list["ProductImage"]] = relationship(back_populates="variant")


class PriceTier(Base):
    __tablename__ = "price_tiers"
    __table_args__ = (UniqueConstraint("variant_id", "minimum_quantity"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    variant_id: Mapped[str] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), index=True
    )
    minimum_quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    variant: Mapped[ProductVariant] = relationship(back_populates="price_tiers")


class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = (
        CheckConstraint(
            "(product_id IS NOT NULL AND variant_id IS NULL) OR "
            "(product_id IS NULL AND variant_id IS NOT NULL)",
            name="ck_product_image_single_owner",
        ),
        Index("idx_product_image_product_type", "product_id", "image_type"),
        Index("idx_product_image_variant", "variant_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=True
    )
    variant_id: Mapped[str | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=True
    )
    image_type: Mapped[str] = mapped_column(String(30))
    file_key: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product: Mapped[Product | None] = relationship(back_populates="images")
    variant: Mapped[ProductVariant | None] = relationship(back_populates="images")


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"
    __table_args__ = (Index("idx_inventory_workspace_created", "workspace_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    variant_id: Mapped[str] = mapped_column(
        ForeignKey("product_variants.id", ondelete="CASCADE"), index=True
    )
    movement_type: Mapped[str] = mapped_column(String(30))
    quantity_delta: Mapped[int] = mapped_column(Integer)
    balance_after: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(500), default="")
    reference: Mapped[str] = mapped_column(String(120), default="")
    created_by: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Order(Base, TimestampMixin):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("workspace_id", "order_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    lead_id: Mapped[str | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"), nullable=True
    )
    order_number: Mapped[str] = mapped_column(String(60))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    order_status: Mapped[str] = mapped_column(String(30), default="pending")
    payment_status: Mapped[str] = mapped_column(String(30), default="unpaid")

    items: Mapped[list["OrderItem"]] = relationship(back_populates="order")
    shipments: Mapped[list["Shipping"]] = relationship(back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[str] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"), index=True
    )
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    order: Mapped[Order] = relationship(back_populates="items")


class Quote(Base, TimestampMixin):
    __tablename__ = "quotes"
    __table_args__ = (
        UniqueConstraint("workspace_id", "quote_number"),
        UniqueConstraint("order_id"),
        CheckConstraint("subtotal_amount >= 0", name="ck_quote_subtotal_nonnegative"),
        CheckConstraint("discount_amount >= 0", name="ck_quote_discount_nonnegative"),
        CheckConstraint("tax_amount >= 0", name="ck_quote_tax_nonnegative"),
        CheckConstraint("shipping_amount >= 0", name="ck_quote_shipping_nonnegative"),
        CheckConstraint("total_amount >= 0", name="ck_quote_total_nonnegative"),
        Index("idx_quote_workspace_status", "workspace_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    lead_id: Mapped[str | None] = mapped_column(
        ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True
    )
    buyer_inquiry_id: Mapped[str | None] = mapped_column(
        ForeignKey("buyer_inquiries.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_id: Mapped[str | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True
    )
    quote_number: Mapped[str] = mapped_column(String(55))
    customer_name: Mapped[str] = mapped_column(String(200))
    customer_email: Mapped[str] = mapped_column(String(254), default="")
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(30), default="draft")
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    valid_until: Mapped[date] = mapped_column(Date)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    shipping_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    notes: Mapped[str] = mapped_column(Text, default="")
    terms: Mapped[str] = mapped_column(Text, default="")
    decision_note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(100), default="")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list["QuoteItem"]] = relationship(
        back_populates="quote", cascade="all, delete-orphan"
    )
    versions: Mapped[list["QuoteVersion"]] = relationship(
        back_populates="quote",
        cascade="all, delete-orphan",
        order_by="QuoteVersion.version_number",
    )


class QuoteItem(Base):
    __tablename__ = "quote_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    quote_id: Mapped[str] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"), index=True)
    variant_id: Mapped[str] = mapped_column(
        ForeignKey("product_variants.id", ondelete="RESTRICT"), index=True
    )
    sku_code: Mapped[str] = mapped_column(String(100))
    product_name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(String(500), default="")
    quantity: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    quote: Mapped[Quote] = relationship(back_populates="items")


class QuoteVersion(Base):
    __tablename__ = "quote_versions"
    __table_args__ = (UniqueConstraint("quote_id", "version_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    quote_id: Mapped[str] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="draft")
    currency: Mapped[str] = mapped_column(String(3))
    valid_until: Mapped[date] = mapped_column(Date)
    subtotal_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    shipping_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    notes: Mapped[str] = mapped_column(Text, default="")
    terms: Mapped[str] = mapped_column(Text, default="")
    items_snapshot: Mapped[list] = mapped_column(JSON, default=list)
    created_by: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    quote: Mapped[Quote] = relationship(back_populates="versions")


class Shipping(Base, TimestampMixin):
    __tablename__ = "shipments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    carrier: Mapped[str] = mapped_column(String(100), default="")
    tracking_number: Mapped[str] = mapped_column(String(100), default="")
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    shipping_status: Mapped[str] = mapped_column(String(30), default="pending")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(100), default="")
    updated_by: Mapped[str] = mapped_column(String(100), default="")

    order: Mapped[Order] = relationship(back_populates="shipments")


class SupplierInquiry(Base, TimestampMixin):
    __tablename__ = "supplier_inquiries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    company_name: Mapped[str] = mapped_column(String(200))
    main_business: Mapped[str] = mapped_column(String(500))
    country: Mapped[str] = mapped_column(String(5))
    contact_name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str] = mapped_column(String(30))
    email: Mapped[str] = mapped_column(String(254))
    remark: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="pending")


class BuyerInquiry(Base, TimestampMixin):
    __tablename__ = "buyer_inquiries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    assigned_workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True
    )
    company_name: Mapped[str] = mapped_column(String(200))
    required_product: Mapped[str] = mapped_column(String(500))
    country: Mapped[str] = mapped_column(String(5))
    contact_name: Mapped[str] = mapped_column(String(150))
    phone: Mapped[str] = mapped_column(String(30))
    email: Mapped[str] = mapped_column(String(254))
    remark: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="pending")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("idx_audit_workspace_created", "workspace_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True, nullable=True
    )
    actor_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str] = mapped_column(String(36))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("workspace_id", "scope", "key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    scope: Mapped[str] = mapped_column(String(100))
    key: Mapped[str] = mapped_column(String(128))
    request_hash: Mapped[str] = mapped_column(String(64))
    response_payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentConversation(Base, TimestampMixin):
    __tablename__ = "agent_conversations"
    __table_args__ = (Index("idx_agent_conversation_workspace_user", "workspace_id", "user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)


class AgentMessage(Base):
    __tablename__ = "agent_messages"
    __table_args__ = (
        Index("idx_agent_message_conversation_created", "conversation_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("agent_conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(30))
    content: Mapped[str] = mapped_column(Text, default="")
    event_type: Mapped[str] = mapped_column(String(50), default="message")
    event_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentExecution(Base, TimestampMixin):
    __tablename__ = "agent_executions"
    __table_args__ = (
        UniqueConstraint("workspace_id", "execution_key"),
        Index("idx_agent_execution_conversation_status", "conversation_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("agent_conversations.id", ondelete="CASCADE"), index=True
    )
    requested_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    execution_key: Mapped[str] = mapped_column(String(128))
    tool_name: Mapped[str] = mapped_column(String(100))
    tool_input: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    result_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    error_code: Mapped[str] = mapped_column(String(80), default="")


class AgentApproval(Base, TimestampMixin):
    __tablename__ = "agent_approvals"
    __table_args__ = (
        UniqueConstraint("execution_id"),
        Index("idx_agent_approval_workspace_status", "workspace_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    execution_id: Mapped[str] = mapped_column(
        ForeignKey("agent_executions.id", ondelete="CASCADE"), index=True
    )
    requested_by: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    decided_by: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    summary: Mapped[str] = mapped_column(String(500), default="")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
