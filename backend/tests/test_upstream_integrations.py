import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import Settings
from app.core.models import OutboxMessage, Product, ProductVariant, Workspace, new_id
from app.modules.outreach.client import EmailOutreachClient
from app.modules.outreach.sync import process_outreach_message
from app.modules.vendure.client import VendureClient
from app.modules.vendure.sync import process_vendure_outbox_message
from tests.conftest import auth_header

NEWLIFE = "10000000-0000-0000-0000-000000000001"
AURORA = "10000000-0000-0000-0000-000000000002"
NEWLIFE_PRODUCT = "40000000-0000-0000-0000-000000000001"
NEWLIFE_VARIANT = "50000000-0000-0000-0000-000000000001"


def _login(client: TestClient, username: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": "Mekyro123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def test_lead_creation_enqueues_workspace_scoped_email_outreach(
    client: TestClient,
    newlife_token: str,
):
    created = client.post(
        f"/api/v1/workspaces/{NEWLIFE}/leads",
        headers=auth_header(newlife_token),
        json={
            "source": "manual",
            "external_ref": "OUTREACH-NEWLIFE-001",
            "merchant_name": "Outreach Merchant",
            "company_name": "Outreach Company",
            "country": "DE",
            "email": "buyer@example.com",
        },
    )
    assert created.status_code == 201, created.text
    lead_id = created.json()["id"]

    async def process_message():
        async with client.app.state.database.sessions() as session:
            message = await session.scalar(
                select(OutboxMessage).where(
                    OutboxMessage.topic == "email.outreach.requested",
                    OutboxMessage.workspace_id == NEWLIFE,
                    OutboxMessage.aggregate_id == lead_id,
                )
            )
            assert message is not None

            class FakeGateway:
                def __init__(self):
                    self.calls = []
                    self.closed = False

                async def trigger(self, **kwargs):
                    self.calls.append(kwargs)
                    return {"accepted": True}

                async def close(self):
                    self.closed = True

            gateway = FakeGateway()
            processed = await process_outreach_message(
                session,
                message.id,
                Settings(),
                gateway_factory=lambda _settings: gateway,
            )
            return processed, gateway

    processed, gateway = asyncio.run(process_message())
    assert processed.status == "processed"
    assert gateway.calls == [
        {"lead_id": lead_id, "workspace_id": NEWLIFE, "allow_repeat": True}
    ]
    assert gateway.closed is True

    aurora_token = _login(client, "aurora")
    disabled = client.post(
        f"/api/v1/workspaces/{AURORA}/leads",
        headers=auth_header(aurora_token),
        json={
            "source": "manual",
            "external_ref": "OUTREACH-AURORA-001",
            "merchant_name": "Disabled Outreach Merchant",
            "company_name": "Disabled Outreach Company",
            "country": "AE",
        },
    )
    assert disabled.status_code == 201

    async def count_disabled():
        async with client.app.state.database.sessions() as session:
            return len(
                list(
                    await session.scalars(
                        select(OutboxMessage).where(
                            OutboxMessage.topic == "email.outreach.requested",
                            OutboxMessage.aggregate_id == disabled.json()["id"],
                        )
                    )
                )
            )

    assert asyncio.run(count_disabled()) == 0


def test_vendure_catalog_sync_is_automatic_and_workspace_scoped(client: TestClient):
    aurora_token = _login(client, "aurora")
    configured = client.patch(
        f"/api/v1/workspaces/{AURORA}",
        headers=auth_header(aurora_token),
        json={
            "vendure_channels_token": "aurora-channel-token",
            "vendure_url": "https://vendure.example.com/admin-api",
        },
    )
    assert configured.status_code == 200, configured.text

    created = client.post(
        f"/api/v1/workspaces/{AURORA}/products",
        headers=auth_header(aurora_token),
        json={
            "name": "Vendure Workspace Product",
            "description": "Created for the latest upstream parity check",
            "status": "active",
            "variants": [
                {
                    "sku_code": "VENDURE-AURORA-001",
                    "currency": "CNY",
                    "stock_quantity": 8,
                    "price_tiers": [{"minimum_quantity": 1, "unit_price": 12.5}],
                }
            ],
        },
    )
    assert created.status_code == 201, created.text
    product_id = created.json()["id"]
    variant_id = created.json()["variants"][0]["id"]

    async def process_message():
        async with client.app.state.database.sessions() as session:
            message = await session.scalar(
                select(OutboxMessage).where(
                    OutboxMessage.topic == "vendure.sync.requested",
                    OutboxMessage.workspace_id == AURORA,
                    OutboxMessage.payload["product_ids"].contains([product_id]),
                )
            )
            assert message is not None

            class FakeGateway:
                def __init__(self):
                    self.calls = []
                    self.closed = False

                async def execute(self, query, variables=None, **_kwargs):
                    self.calls.append((query, variables))
                    if "MekyroVendureProductFind" in query:
                        return {"byMekyro": {"items": []}, "bySlug": {"items": []}}
                    if "MekyroVendureProductCreate" in query:
                        return {"createProduct": {"id": "vendure-product-701"}}
                    if "MekyroVendureProductOptions" in query:
                        return {"product": {"optionGroups": [], "variants": []}}
                    if "MekyroVendureVariantsCreate" in query:
                        return {
                            "createProductVariants": [
                                {"id": "vendure-variant-801", "sku": item["sku"]}
                                for item in variables["input"]
                            ]
                        }
                    raise AssertionError(f"Unexpected Vendure operation: {query}")

                async def close(self):
                    self.closed = True

            gateway = FakeGateway()
            processed = await process_vendure_outbox_message(
                session,
                message.id,
                Settings(),
                gateway_factory=lambda _workspace, _settings: gateway,
            )
            product = await session.get(Product, product_id)
            variant = await session.get(ProductVariant, variant_id)
            return processed, gateway, product, variant

    processed, gateway, product, variant = asyncio.run(process_message())
    assert processed.status == "processed"
    assert product.external_ids["vendure_product_id"] == "vendure-product-701"
    assert variant.external_ids["vendure_variant_id"] == "vendure-variant-801"
    assert gateway.closed is True
    create_call = next(
        variables
        for query, variables in gateway.calls
        if "MekyroVendureVariantsCreate" in query
    )
    assert create_call["input"][0]["price"] == 1250
    assert create_call["input"][0]["stockOnHand"] == 8


def test_vendure_outbox_rejects_product_from_another_workspace(client: TestClient):
    async def exercise():
        async with client.app.state.database.sessions() as session:
            workspace = await session.get(Workspace, AURORA)
            workspace.vendure_channels_token = "aurora-channel-token"
            message = OutboxMessage(
                id=new_id(),
                workspace_id=AURORA,
                topic="vendure.sync.requested",
                aggregate_type="workspace",
                aggregate_id=AURORA,
                deduplication_key=f"vendure:tenant-negative:{new_id()}",
                payload={"operation": "catalog", "product_ids": [NEWLIFE_PRODUCT]},
            )
            session.add(message)
            await session.commit()

            class NoCallGateway:
                async def execute(self, *_args, **_kwargs):
                    raise AssertionError("Cross-tenant product must not reach Vendure")

                async def close(self):
                    pass

            with pytest.raises(ValueError, match="not found in the Workspace"):
                await process_vendure_outbox_message(
                    session,
                    message.id,
                    Settings(),
                    gateway_factory=lambda _workspace, _settings: NoCallGateway(),
                )

    asyncio.run(exercise())


def test_variant_price_update_persists_and_keeps_tenant_boundary(
    client: TestClient,
    newlife_token: str,
):
    updated = client.patch(
        f"/api/v1/workspaces/{NEWLIFE}/variants/{NEWLIFE_VARIANT}",
        headers=auth_header(newlife_token),
        json={"price": 88.66},
    )
    assert updated.status_code == 200, updated.text
    tiers = updated.json()["price_tiers"]
    lowest_tier = min(tiers, key=lambda item: item["minimum_quantity"])
    assert lowest_tier["unit_price"] == "88.66"

    aurora_token = _login(client, "aurora")
    cross_tenant = client.patch(
        f"/api/v1/workspaces/{AURORA}/variants/{NEWLIFE_VARIANT}",
        headers=auth_header(aurora_token),
        json={"price": 1},
    )
    assert cross_tenant.status_code == 404


@pytest.mark.asyncio
async def test_external_integration_clients_send_tenant_and_auth_headers():
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "mail.example.com":
            return httpx.Response(200, json={"accepted": True})
        return httpx.Response(200, json={"data": {"shop": {"name": "Vendure"}}})

    transport = httpx.MockTransport(handler)
    settings = Settings(
        email_outreach_api_url="https://mail.example.com/outreaches",
        email_outreach_api_key="mail-secret",
        email_outreach_idempotency_key_prefix="mekyro-test",
        vendure_api_key="vendure-secret",
    )
    workspace = Workspace(
        id=AURORA,
        name="Aurora",
        slug="aurora",
        vendure_url="https://vendure.example.com/admin-api",
        vendure_channels_token="aurora-channel-token",
    )
    async with httpx.AsyncClient(transport=transport) as http_client:
        outreach = EmailOutreachClient(settings, http_client=http_client)
        assert (
            await outreach.trigger(
                lead_id="lead-123",
                workspace_id=AURORA,
            )
        )["accepted"] is True
        vendure = VendureClient(workspace, settings, http_client=http_client)
        assert (await vendure.execute("query { shop { name } }"))["shop"]["name"] == "Vendure"

    mail_request, vendure_request = requests
    assert mail_request.headers["X-API-Key"] == "mail-secret"
    assert mail_request.headers["X-Mekyro-Workspace-ID"] == AURORA
    assert mail_request.headers["Idempotency-Key"] == "mekyro-test-lead-lead-123"
    assert vendure_request.headers["vendure-api-key"] == "vendure-secret"
    assert vendure_request.headers["vendure-token"] == "aurora-channel-token"
