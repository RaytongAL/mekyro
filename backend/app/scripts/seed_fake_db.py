import argparse
import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.database import Database
from app.core.models import (
    AgentApproval,
    AgentConversation,
    AgentExecution,
    AgentMessage,
    ApiKey,
    AuditLog,
    AuthChallenge,
    BuyerInquiry,
    Category,
    ContactActivity,
    IdempotencyRecord,
    InventoryMovement,
    Lead,
    Order,
    OrderItem,
    OutboxMessage,
    PriceTier,
    Product,
    ProductImage,
    ProductVariant,
    Quote,
    QuoteItem,
    QuoteVersion,
    Shipping,
    ShopifyConfig,
    SupplierInquiry,
    User,
    Workspace,
    WorkspaceInvitation,
    WorkspaceMember,
    WorkspacePromptVersion,
)
from app.core.secrets import encrypt_secret
from app.core.security import hash_password

FAKE_API_KEY = "mek_fake_aurora_readonly_2026"

IDS = {
    "user_ops": "00000000-0000-0000-0000-000000000001",
    "user_newlife": "00000000-0000-0000-0000-000000000002",
    "user_aurora": "00000000-0000-0000-0000-000000000003",
    "workspace_newlife": "10000000-0000-0000-0000-000000000001",
    "workspace_aurora": "10000000-0000-0000-0000-000000000002",
    "lead_paris": "20000000-0000-0000-0000-000000000001",
    "lead_madrid": "20000000-0000-0000-0000-000000000002",
    "lead_berlin": "20000000-0000-0000-0000-000000000003",
    "lead_dubai": "20000000-0000-0000-0000-000000000004",
    "category_phones": "30000000-0000-0000-0000-000000000001",
    "category_accessories": "30000000-0000-0000-0000-000000000002",
    "category_home": "30000000-0000-0000-0000-000000000003",
    "product_iphone": "40000000-0000-0000-0000-000000000001",
    "product_charger": "40000000-0000-0000-0000-000000000002",
    "product_lamp": "40000000-0000-0000-0000-000000000003",
    "variant_iphone_a": "50000000-0000-0000-0000-000000000001",
    "variant_iphone_b": "50000000-0000-0000-0000-000000000002",
    "variant_charger": "50000000-0000-0000-0000-000000000003",
    "variant_lamp": "50000000-0000-0000-0000-000000000004",
    "order_newlife_pending": "60000000-0000-0000-0000-000000000001",
    "order_newlife_completed": "60000000-0000-0000-0000-000000000002",
    "order_aurora_pending": "60000000-0000-0000-0000-000000000003",
    "quote_newlife_draft": "65000000-0000-0000-0000-000000000001",
    "quote_version_newlife_draft": "65000000-0000-0000-0000-000000000002",
    "prompt_version_newlife": "66000000-0000-0000-0000-000000000001",
    "prompt_version_aurora": "66000000-0000-0000-0000-000000000002",
    "supplier_inquiry": "70000000-0000-0000-0000-000000000001",
    "buyer_inquiry": "70000000-0000-0000-0000-000000000002",
    "api_key_aurora": "80000000-0000-0000-0000-000000000001",
    "auth_challenge_expired": "80000000-0000-0000-0000-000000000002",
    "shopify_config_aurora": "80000000-0000-0000-0000-000000000003",
    "outbox_aurora_processed": "80000000-0000-0000-0000-000000000004",
    "invitation_aurora_expired": "80000000-0000-0000-0000-000000000005",
    "product_image_lamp": "80000000-0000-0000-0000-000000000006",
    "audit_seed": "80000000-0000-0000-0000-000000000007",
    "idempotency_seed": "80000000-0000-0000-0000-000000000008",
    "agent_conversation_aurora": "80000000-0000-0000-0000-000000000009",
    "agent_message_aurora": "80000000-0000-0000-0000-000000000010",
    "agent_execution_aurora": "80000000-0000-0000-0000-000000000011",
    "agent_approval_aurora": "80000000-0000-0000-0000-000000000012",
}


async def seed_database(database: Database) -> bool:
    async with database.sessions() as session:
        existing = await session.scalar(select(func.count(User.id)))
        if existing:
            return False

        now = datetime.now(UTC)
        common_password = hash_password("Mekyro123!")
        ops = User(
            id=IDS["user_ops"],
            username="ops",
            email="ops@mekyro.local",
            display_name="Mekyro Operations",
            password_hash=common_password,
            is_platform_admin=True,
        )
        newlife_user = User(
            id=IDS["user_newlife"],
            username="newlife",
            email="owner@newlife.example",
            display_name="Ray Chen",
            phone="8613800138000",
            password_hash=common_password,
        )
        aurora_user = User(
            id=IDS["user_aurora"],
            username="aurora",
            email="owner@aurora.example",
            display_name="Mia Lin",
            password_hash=common_password,
            language="en-US",
        )
        newlife = Workspace(
            id=IDS["workspace_newlife"],
            name="New Life Refurb Supply",
            slug="newlife-refurb",
            description="Hong Kong supplier of certified pre-owned mobile devices.",
            site_type="shopify",
            lead_acquisition_requirement="European mobile retailers seeking recurring CPO inventory.",
            prompt="European mobile retailers seeking recurring CPO inventory.",
            email_outreach_enabled=True,
        )
        aurora = Workspace(
            id=IDS["workspace_aurora"],
            name="Aurora Home Export",
            slug="aurora-home",
            description="Shenzhen smart home lighting manufacturer.",
            site_type="vendure",
            lead_acquisition_requirement="Distributors in the Middle East with local installation partners.",
            prompt="Distributors in the Middle East with local installation partners.",
            email_outreach_enabled=False,
        )
        session.add_all([ops, newlife_user, aurora_user, newlife, aurora])
        session.add_all(
            [
                WorkspaceMember(
                    workspace_id=newlife.id,
                    user_id=newlife_user.id,
                    name="Ray Chen",
                    role="owner",
                ),
                WorkspaceMember(
                    workspace_id=aurora.id,
                    user_id=aurora_user.id,
                    name="Mia Lin",
                    role="owner",
                ),
            ]
        )
        await session.flush()

        settings = get_settings()
        session.add_all(
            [
                ApiKey(
                    id=IDS["api_key_aurora"],
                    user_id=ops.id,
                    workspace_id=aurora.id,
                    name="Aurora fake read-only key",
                    key_hash=hashlib.sha256(FAKE_API_KEY.encode("utf-8")).hexdigest(),
                    key_prefix=FAKE_API_KEY[:8],
                    permissions=["lead:read", "product:read", "workspace:read"],
                ),
                AuthChallenge(
                    id=IDS["auth_challenge_expired"],
                    channel="email",
                    target="expired-challenge@example.invalid",
                    purpose="login",
                    code_hash=hashlib.sha256(b"000000").hexdigest(),
                    ip_address="127.0.0.254",
                    captcha_verified=True,
                    expires_at=now - timedelta(days=2),
                    used_at=now - timedelta(days=3),
                    created_at=now - timedelta(days=4),
                ),
                ShopifyConfig(
                    id=IDS["shopify_config_aurora"],
                    workspace_id=aurora.id,
                    store_url="https://aurora-fake.myshopify.com",
                    api_key_encrypted=encrypt_secret("fake-aurora-client", settings),
                    api_secret_encrypted=encrypt_secret("fake-aurora-secret", settings),
                    is_active=False,
                ),
                OutboxMessage(
                    id=IDS["outbox_aurora_processed"],
                    workspace_id=aurora.id,
                    topic="shopify.sync.requested",
                    aggregate_type="workspace",
                    aggregate_id=aurora.id,
                    deduplication_key="fake:aurora:processed-catalog",
                    payload={"operation": "catalog", "product_ids": [IDS["product_lamp"]]},
                    status="processed",
                    attempts=1,
                    available_at=now - timedelta(days=2),
                    processed_at=now - timedelta(days=2),
                    created_at=now - timedelta(days=2),
                ),
                WorkspaceInvitation(
                    id=IDS["invitation_aurora_expired"],
                    workspace_id=aurora.id,
                    email="expired-invite@example.invalid",
                    role="member",
                    token_prefix="expired_fake",
                    token_hash=hashlib.sha256(b"expired-fake-invitation").hexdigest(),
                    status="expired",
                    expires_at=now - timedelta(days=1),
                    invited_by=aurora_user.id,
                ),
            ]
        )
        await session.flush()
        session.add_all(
            [
                WorkspacePromptVersion(
                    id=IDS["prompt_version_newlife"],
                    workspace_id=newlife.id,
                    version=1,
                    prompt="",
                    daily_lead_limit=0,
                    created_by=ops.id,
                ),
                WorkspacePromptVersion(
                    id=IDS["prompt_version_aurora"],
                    workspace_id=aurora.id,
                    version=1,
                    prompt="",
                    daily_lead_limit=0,
                    created_by=ops.id,
                ),
            ]
        )

        leads = [
            Lead(
                id=IDS["lead_paris"],
                workspace_id=newlife.id,
                source="amazon",
                external_ref="AMZ-FR-1028",
                merchant_name="Paris Mobile Retail",
                company_name="PMR Distribution SAS",
                contact_person="Julien Moreau",
                country="FR",
                city="Paris",
                email="julien@pmr.example",
                phone="+33184001028",
                whatsapp="+33612001028",
                stage="qualified",
                recommendation_score=91,
                recommendation_reason="Strong recurring demand and verified multi-store footprint.",
                created_at=now - timedelta(days=18),
            ),
            Lead(
                id=IDS["lead_madrid"],
                workspace_id=newlife.id,
                source="manual",
                external_ref="MAN-ES-2041",
                merchant_name="Madrid Device Hub",
                company_name="MDH Comercio SL",
                contact_person="Sofia Martin",
                country="ES",
                city="Madrid",
                email="sofia@mdh.example",
                whatsapp="+34620002041",
                stage="contacting",
                recommendation_score=78,
                recommendation_reason="Good category fit; purchasing volume still needs confirmation.",
                created_at=now - timedelta(days=9),
            ),
            Lead(
                id=IDS["lead_berlin"],
                workspace_id=newlife.id,
                source="website",
                external_ref="WEB-DE-3107",
                merchant_name="Berlin Circular Tech",
                company_name="BCT GmbH",
                contact_person="Anna Weber",
                country="DE",
                city="Berlin",
                email="anna@bct.example",
                stage="new",
                recommendation_score=66,
                recommendation_reason="Inbound inquiry with clear product interest but no volume yet.",
                created_at=now - timedelta(days=2),
            ),
            Lead(
                id=IDS["lead_dubai"],
                workspace_id=aurora.id,
                source="trade_show",
                external_ref="GITEX-AE-0088",
                merchant_name="Dubai Smart Living",
                company_name="DSL Trading LLC",
                contact_person="Omar Haddad",
                country="AE",
                city="Dubai",
                email="omar@dsl.example",
                phone="+971500000088",
                stage="quoting",
                recommendation_score=88,
                recommendation_reason="Qualified distributor requesting a regional price schedule.",
                created_at=now - timedelta(days=12),
            ),
        ]
        session.add_all(leads)
        session.add_all(
            [
                ContactActivity(
                    workspace_id=newlife.id,
                    lead_id=IDS["lead_paris"],
                    activity_type="human_outbound",
                    direction="outbound",
                    channel="email",
                    subject="CPO iPhone 13 availability",
                    sender="sales@newlife.example",
                    recipient="julien@pmr.example",
                    content="Shared current grades, MOQ and indicative volume pricing.",
                    created_at=now - timedelta(days=6),
                ),
                ContactActivity(
                    workspace_id=newlife.id,
                    lead_id=IDS["lead_paris"],
                    activity_type="customer_inbound",
                    direction="inbound",
                    channel="email",
                    subject="Re: CPO iPhone 13 availability",
                    sender="julien@pmr.example",
                    recipient="sales@newlife.example",
                    content="Buyer requested a formal quote for 20 mixed-grade units.",
                    created_at=now - timedelta(days=5),
                ),
                ContactActivity(
                    workspace_id=newlife.id,
                    lead_id=IDS["lead_madrid"],
                    activity_type="human_outbound",
                    direction="outbound",
                    channel="whatsapp",
                    content="Introduced weekly CPO inventory list and requested target models.",
                    created_at=now - timedelta(days=3),
                ),
                ContactActivity(
                    workspace_id=aurora.id,
                    lead_id=IDS["lead_dubai"],
                    activity_type="customer_inbound",
                    direction="inbound",
                    channel="email",
                    subject="Distributor quotation request",
                    content="Requested 500 smart lamps with UAE plug and private-label packaging.",
                    created_at=now - timedelta(days=4),
                ),
            ]
        )

        phone_category = Category(
            id=IDS["category_phones"], workspace_id=newlife.id, name="Mobile Phones"
        )
        accessory_category = Category(
            id=IDS["category_accessories"], workspace_id=newlife.id, name="Accessories"
        )
        home_category = Category(
            id=IDS["category_home"], workspace_id=aurora.id, name="Smart Lighting"
        )
        session.add_all([phone_category, accessory_category, home_category])
        await session.flush()
        products = [
            Product(
                id=IDS["product_iphone"],
                workspace_id=newlife.id,
                category_id=phone_category.id,
                name="iPhone 13 Certified Pre-Owned",
                description="Professionally tested CPO devices with battery and cosmetic grading.",
                specification_template=[
                    {"name": "Grade", "options": ["A", "B"]},
                    {"name": "Storage", "options": ["128GB"]},
                ],
                external_ids={"shopify_product_id": "gid://shopify/Product/fake-1001"},
            ),
            Product(
                id=IDS["product_charger"],
                workspace_id=newlife.id,
                category_id=accessory_category.id,
                name="20W USB-C Charger",
                description="EU plug fast charger for wholesale bundles.",
                specification_template=[{"name": "Plug", "options": ["EU"]}],
            ),
            Product(
                id=IDS["product_lamp"],
                workspace_id=aurora.id,
                category_id=home_category.id,
                name="Aurora Wi-Fi Smart Lamp",
                description="App-controlled RGBW lamp for residential projects.",
                specification_template=[{"name": "Plug", "options": ["EU", "UK"]}],
                external_ids={"vendure_product_id": "fake-vendure-8801"},
            ),
        ]
        session.add_all(products)
        await session.flush()
        variants = [
            ProductVariant(
                id=IDS["variant_iphone_a"],
                workspace_id=newlife.id,
                product_id=IDS["product_iphone"],
                sku_code="IP13-128-A",
                specifications={"Grade": "A", "Storage": "128GB"},
                minimum_order_quantity=10,
                stock_quantity=84,
                external_ids={"shopify_variant_id": "gid://shopify/ProductVariant/fake-1101"},
            ),
            ProductVariant(
                id=IDS["variant_iphone_b"],
                workspace_id=newlife.id,
                product_id=IDS["product_iphone"],
                sku_code="IP13-128-B",
                specifications={"Grade": "B", "Storage": "128GB"},
                minimum_order_quantity=10,
                stock_quantity=36,
            ),
            ProductVariant(
                id=IDS["variant_charger"],
                workspace_id=newlife.id,
                product_id=IDS["product_charger"],
                sku_code="CHG-20W-EU",
                specifications={"Plug": "EU"},
                minimum_order_quantity=100,
                stock_quantity=0,
            ),
            ProductVariant(
                id=IDS["variant_lamp"],
                workspace_id=aurora.id,
                product_id=IDS["product_lamp"],
                sku_code="LAMP-RGBW-UAE",
                specifications={"Plug": "UK"},
                minimum_order_quantity=200,
                stock_quantity=1250,
            ),
        ]
        session.add_all(variants)
        await session.flush()
        session.add(
            ProductImage(
                id=IDS["product_image_lamp"],
                product_id=IDS["product_lamp"],
                image_type="product",
                file_key="https://images.example.invalid/aurora-smart-lamp.jpg",
                created_at=now - timedelta(days=7),
            )
        )
        session.add_all(
            [
                PriceTier(
                    variant_id=IDS["variant_iphone_a"],
                    minimum_quantity=10,
                    unit_price=Decimal("420"),
                ),
                PriceTier(
                    variant_id=IDS["variant_iphone_a"],
                    minimum_quantity=50,
                    unit_price=Decimal("405"),
                ),
                PriceTier(
                    variant_id=IDS["variant_iphone_b"],
                    minimum_quantity=10,
                    unit_price=Decimal("365"),
                ),
                PriceTier(
                    variant_id=IDS["variant_charger"],
                    minimum_quantity=100,
                    unit_price=Decimal("5.80"),
                ),
                PriceTier(
                    variant_id=IDS["variant_lamp"], minimum_quantity=200, unit_price=Decimal("8.90")
                ),
                PriceTier(
                    variant_id=IDS["variant_lamp"],
                    minimum_quantity=1000,
                    unit_price=Decimal("7.75"),
                ),
            ]
        )
        session.add_all(
            [
                InventoryMovement(
                    workspace_id=newlife.id,
                    variant_id=IDS["variant_iphone_a"],
                    movement_type="inbound",
                    quantity_delta=100,
                    balance_after=100,
                    reason="Weekly refurbishment batch completed",
                    reference="BATCH-2026-0718",
                    created_by="newlife",
                    created_at=now - timedelta(days=10),
                ),
                InventoryMovement(
                    workspace_id=newlife.id,
                    variant_id=IDS["variant_iphone_a"],
                    movement_type="outbound",
                    quantity_delta=-16,
                    balance_after=84,
                    reason="Wholesale order allocation",
                    reference="ORD-NL-20260721",
                    created_by="newlife",
                    created_at=now - timedelta(days=7),
                ),
                InventoryMovement(
                    workspace_id=aurora.id,
                    variant_id=IDS["variant_lamp"],
                    movement_type="inbound",
                    quantity_delta=1250,
                    balance_after=1250,
                    reason="Production lot received",
                    reference="LOT-AU-0720",
                    created_by="aurora",
                    created_at=now - timedelta(days=8),
                ),
            ]
        )
        orders = [
            Order(
                id=IDS["order_newlife_pending"],
                workspace_id=newlife.id,
                lead_id=IDS["lead_paris"],
                order_number="NL-2026-0001",
                total_amount=Decimal("8000"),
                currency="USD",
                order_status="pending",
                payment_status="unpaid",
            ),
            Order(
                id=IDS["order_newlife_completed"],
                workspace_id=newlife.id,
                lead_id=IDS["lead_madrid"],
                order_number="NL-2026-0002",
                total_amount=Decimal("3650"),
                currency="USD",
                order_status="completed",
                payment_status="paid",
            ),
            Order(
                id=IDS["order_aurora_pending"],
                workspace_id=aurora.id,
                lead_id=IDS["lead_dubai"],
                order_number="AU-2026-0001",
                total_amount=Decimal("4450"),
                currency="USD",
                order_status="pending",
                payment_status="partial",
            ),
        ]
        session.add_all(orders)
        session.add_all(
            [
                OrderItem(
                    order_id=IDS["order_newlife_pending"],
                    variant_id=IDS["variant_iphone_a"],
                    quantity=20,
                    unit_price=Decimal("400"),
                ),
                OrderItem(
                    order_id=IDS["order_newlife_completed"],
                    variant_id=IDS["variant_iphone_b"],
                    quantity=10,
                    unit_price=Decimal("365"),
                ),
                OrderItem(
                    order_id=IDS["order_aurora_pending"],
                    variant_id=IDS["variant_lamp"],
                    quantity=500,
                    unit_price=Decimal("8.90"),
                ),
                Shipping(
                    workspace_id=newlife.id,
                    order_id=IDS["order_newlife_completed"],
                    carrier="DHL",
                    tracking_number="DHL-NL-2026-0002",
                    shipped_at=now - timedelta(days=2),
                    shipping_status="delivered",
                    created_by="ops",
                    updated_by="ops",
                ),
            ]
        )
        quote_items_snapshot = [
            {
                "variant_id": IDS["variant_iphone_a"],
                "sku_code": "IP13-128-A",
                "product_name": "iPhone 13 Certified Pre-Owned",
                "description": "Grade A devices with 12-month warranty",
                "quantity": 20,
                "unit_price": "400.00",
                "line_total": "8000.00",
            }
        ]
        session.add(
            Quote(
                id=IDS["quote_newlife_draft"],
                workspace_id=newlife.id,
                lead_id=IDS["lead_paris"],
                quote_number="Q-NL-2026-0001",
                customer_name="PMR Distribution SAS",
                customer_email="julien@pmr.example",
                current_version=1,
                status="draft",
                currency="USD",
                valid_until=(now + timedelta(days=14)).date(),
                subtotal_amount=Decimal("8000"),
                discount_amount=Decimal("0"),
                tax_amount=Decimal("0"),
                shipping_amount=Decimal("0"),
                total_amount=Decimal("8000"),
                notes="Formal offer requested after initial product discussion.",
                terms="Net 30; EXW Hong Kong.",
                created_by="newlife",
            )
        )
        session.add_all(
            [
                QuoteItem(
                    quote_id=IDS["quote_newlife_draft"],
                    variant_id=IDS["variant_iphone_a"],
                    sku_code="IP13-128-A",
                    product_name="iPhone 13 Certified Pre-Owned",
                    description="Grade A devices with 12-month warranty",
                    quantity=20,
                    unit_price=Decimal("400"),
                    line_total=Decimal("8000"),
                ),
                QuoteVersion(
                    id=IDS["quote_version_newlife_draft"],
                    quote_id=IDS["quote_newlife_draft"],
                    version_number=1,
                    status="draft",
                    currency="USD",
                    valid_until=(now + timedelta(days=14)).date(),
                    subtotal_amount=Decimal("8000"),
                    discount_amount=Decimal("0"),
                    tax_amount=Decimal("0"),
                    shipping_amount=Decimal("0"),
                    total_amount=Decimal("8000"),
                    notes="Formal offer requested after initial product discussion.",
                    terms="Net 30; EXW Hong Kong.",
                    items_snapshot=quote_items_snapshot,
                    created_by="newlife",
                ),
            ]
        )
        session.add_all(
            [
                SupplierInquiry(
                    id=IDS["supplier_inquiry"],
                    company_name="Pacific Components Manufacturing",
                    main_business="Consumer electronics components",
                    country="CN",
                    contact_name="Chen Ming",
                    phone="+8613900000001",
                    email="sales@pacific-components.example",
                    remark="Interested in the supplier onboarding program.",
                ),
                BuyerInquiry(
                    id=IDS["buyer_inquiry"],
                    company_name="Benelux Device Wholesale",
                    required_product="Recurring certified mobile device supply",
                    country="NL",
                    contact_name="Sophie de Vries",
                    phone="+31600000001",
                    email="buying@benelux-device.example",
                    status="processing",
                ),
            ]
        )
        conversation = AgentConversation(
            id=IDS["agent_conversation_aurora"],
            workspace_id=aurora.id,
            user_id=aurora_user.id,
            title="Fake completed inventory check",
            status="active",
            created_at=now - timedelta(days=2),
            updated_at=now - timedelta(days=2),
        )
        session.add(conversation)
        await session.flush()
        execution = AgentExecution(
            id=IDS["agent_execution_aurora"],
            workspace_id=aurora.id,
            conversation_id=conversation.id,
            requested_by=aurora_user.id,
            execution_key="fake:aurora:inventory-check",
            tool_name="product_check_stock",
            tool_input={"sku_id": IDS["variant_lamp"]},
            status="succeeded",
            attempt_count=1,
            result_payload={"stock_quantity": 1250},
            created_at=now - timedelta(days=2),
            updated_at=now - timedelta(days=2),
        )
        session.add(execution)
        await session.flush()
        session.add_all(
            [
                AgentMessage(
                    id=IDS["agent_message_aurora"],
                    conversation_id=conversation.id,
                    role="tool",
                    content='{"stock_quantity":1250}',
                    event_type="tool_result",
                    event_payload={"tool": "product_check_stock"},
                    created_at=now - timedelta(days=2),
                ),
                AgentApproval(
                    id=IDS["agent_approval_aurora"],
                    workspace_id=aurora.id,
                    execution_id=execution.id,
                    requested_by=aurora_user.id,
                    decided_by=aurora_user.id,
                    status="approved",
                    summary="Fake completed inventory check",
                    expires_at=now - timedelta(days=1),
                    decided_at=now - timedelta(days=2),
                    created_at=now - timedelta(days=2),
                    updated_at=now - timedelta(days=2),
                ),
                AuditLog(
                    id=IDS["audit_seed"],
                    workspace_id=aurora.id,
                    actor_user_id=aurora_user.id,
                    action="fake_database.seeded",
                    entity_type="workspace",
                    entity_id=aurora.id,
                    payload={"purpose": "local functional validation"},
                    created_at=now - timedelta(days=2),
                ),
                IdempotencyRecord(
                    id=IDS["idempotency_seed"],
                    workspace_id=aurora.id,
                    scope="fake.seed",
                    key="completed-command",
                    request_hash=hashlib.sha256(b"fake-seed-command").hexdigest(),
                    response_payload={"status": "completed"},
                    created_at=now - timedelta(days=2),
                ),
            ]
        )
        await session.commit()
        return True


async def main(reset: bool, create_schema: bool = True) -> None:
    database = Database(get_settings().database_url)
    if reset:
        await database.drop_schema()
    if create_schema:
        await database.create_schema()
    created = await seed_database(database)
    await database.dispose()
    print("Fake database seeded." if created else "Fake database already contains data.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create the local Mekyro fake database")
    parser.add_argument("--reset", action="store_true", help="Drop and recreate all tables")
    parser.add_argument(
        "--skip-schema",
        action="store_true",
        help="Seed an existing schema managed by Alembic",
    )
    arguments = parser.parse_args()
    if arguments.reset and arguments.skip_schema:
        parser.error("--reset cannot be combined with --skip-schema")
    asyncio.run(main(arguments.reset, create_schema=not arguments.skip_schema))
