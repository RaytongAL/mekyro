# Mekyro FastAPI

FastAPI-native functional rebuild of Mekyro. This repository does not depend on
the Django application and does not preserve its internal architecture.

## Local development

```bash
source .venv/bin/activate
cp .env.example .env
uv sync --dev
python -m app.scripts.seed_fake_db --reset
uvicorn app.main:app --reload --port 8200
```

Create or upgrade a deployment database with migrations before starting the
application:

```bash
alembic upgrade head
```

OpenAPI documentation: <http://127.0.0.1:8200/docs>

The development database is SQLite and is generated from a representative
Mekyro dataset. Production configuration uses a PostgreSQL SQLAlchemy URL.

The current business slice covers supplier provisioning, user profiles,
Workspace configuration and member roles, onboarding, CRM, inquiries, catalog
and inventory, versioned quotes, quote-to-order conversion, shipping, API key
access, Shopify synchronization, and an approval-aware SSE Agent for CRM,
catalog, configuration, and onboarding tools. The acceptance index is
maintained in `docs/feature-test-registry.md`.

## Agent model gateway

The Agent can call any OpenAI-compatible `/chat/completions` endpoint. Configure
the provider in `.env`:

```bash
MEKYRO_AGENT_API_KEY=your-provider-key
MEKYRO_AGENT_BASE_URL=https://api.deepseek.com
MEKYRO_AGENT_MODEL=deepseek-chat
MEKYRO_AGENT_TIMEOUT_SECONDS=30
```

When `MEKYRO_AGENT_API_KEY` is empty, the application uses the deterministic
offline gateway. This keeps local development and the default test suite
independent from an external model provider. Provider credentials are never
returned by the API.

## Development accounts

| Role | Username | Password |
|---|---|---|
| Platform operator | `ops` | `Mekyro123!` |
| Supplier | `newlife` | `Mekyro123!` |
| Supplier | `aurora` | `Mekyro123!` |

## Verification

```bash
ruff check .
pytest
```

Process pending Shopify synchronization jobs once or run the worker continuously:

```bash
python -m app.scripts.process_outbox --once
python -m app.scripts.process_outbox
```
