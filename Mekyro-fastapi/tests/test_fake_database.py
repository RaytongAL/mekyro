import asyncio

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core import models
from app.scripts.seed_fake_db import FAKE_API_KEY, IDS

PERSISTED_MODELS = (
    models.User,
    models.Workspace,
    models.WorkspaceMember,
    models.ApiKey,
    models.AuthChallenge,
    models.ShopifyConfig,
    models.OutboxMessage,
    models.WorkspacePromptVersion,
    models.WorkspaceInvitation,
    models.Lead,
    models.ContactActivity,
    models.Category,
    models.Product,
    models.ProductVariant,
    models.PriceTier,
    models.ProductImage,
    models.InventoryMovement,
    models.Order,
    models.OrderItem,
    models.Quote,
    models.QuoteItem,
    models.QuoteVersion,
    models.Shipping,
    models.SupplierInquiry,
    models.BuyerInquiry,
    models.AuditLog,
    models.IdempotencyRecord,
    models.AgentConversation,
    models.AgentMessage,
    models.AgentExecution,
    models.AgentApproval,
)


def test_fake_database_covers_every_persisted_domain(client: TestClient):
    async def counts() -> dict[str, int]:
        async with client.app.state.database.sessions() as session:
            return {
                model.__name__: (
                    await session.scalar(select(func.count()).select_from(model)) or 0
                )
                for model in PERSISTED_MODELS
            }

    seeded_counts = asyncio.run(counts())
    assert all(count > 0 for count in seeded_counts.values()), seeded_counts


def test_fake_api_key_exercises_aurora_read_models(client: TestClient):
    headers = {"X-Api-Key": FAKE_API_KEY}
    leads = client.get("/api/v1/external/leads", headers=headers)
    products = client.get("/api/v1/external/products", headers=headers)
    prompt = client.get("/api/v1/external/workspace/prompt", headers=headers)

    assert leads.status_code == 200, leads.text
    assert [item["id"] for item in leads.json()["items"]] == [IDS["lead_dubai"]]
    assert products.status_code == 200, products.text
    assert [item["id"] for item in products.json()["items"]] == [IDS["product_lamp"]]
    assert prompt.status_code == 200, prompt.text
    assert prompt.json()["workspace_id"] == IDS["workspace_aurora"]
