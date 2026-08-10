# Architecture

## Current scope

The current vertical slice implements authentication and user profiles,
explicit workspace tenancy, operator-led supplier provisioning, supplier
account lifecycle, member invitations and roles, versioned prompts, the
three-step onboarding state machine, CRM reads and writes, catalog reads and
lifecycle writes, transactional inventory adjustments, audit logs, quote
negotiation and conversion, orders and shipping, and dashboard aggregates. It
is a new FastAPI application rather than a translation of Django views.

The Workspace Agent exposes authenticated SSE chat with persistent
conversations and messages. Read tools execute in the caller's immutable
Workspace context. Business writes create an expiring approval and a unique
execution ledger entry before invoking the existing module command. Duplicate
confirmation returns the persisted result; uncertain outcomes require explicit
reconciliation and only an allowlist of idempotent commands can be retried.

External CRM and catalog APIs authenticate with a hashed `X-Api-Key`. The raw
key is revealed only when issued; permissions and Workspace scope are resolved
from the stored credential and cannot be supplied by the caller.

SMS and email authentication share a persisted challenge model. Verification
codes are HMAC-hashed, expire after five minutes, lock after repeated failures,
and are consumed once. Target interval, network-hour and target-day limits are
evaluated against the challenge table; SMS issuance also requires the
pluggable CAPTCHA gateway.

Catalog media uses a local filesystem adapter in development. Persisted media
records contain URLs, so production object storage can replace the adapter
without changing product ownership rules. Product imports use an XLSX template,
preview validation, and an atomic confirmation command.

## Request boundary

Interactive tenant APIs contain `workspace_id` in their path. Authentication
and workspace membership are checked before module code receives a
`WorkspaceContext`. External API-key routes omit the path Workspace and use the
credential's immutable tenant context instead. A platform administrator may
access all active workspaces.

## Development database

`app.scripts.seed_fake_db` creates a deterministic dataset derived from the
business concepts in the previous implementation:

- platform users, supplier users, workspaces and memberships;
- Workspace prompt versions, onboarding state, and representative supplier
  account configuration;
- leads and email/WhatsApp activities;
- categories, products, variants, price tiers and inventory movements;
- versioned quotes, quote item snapshots, orders and shipping records;
- inquiries, API keys, Shopify configurations and outbox jobs;
- audit/idempotency records and Agent conversations, executions and approvals.

The fake dataset intentionally contains two workspaces so automated tests can
prove that IDs from one tenant cannot be used to read another tenant's data.
SQLite is used only for local development and tests. SQLAlchemy models remain
portable to PostgreSQL, which is the intended production database.

## Write boundary

Workspace writes are limited to owners, workspace administrators, and platform
administrators. Inventory adjustments require an idempotency key and persist the
balance, movement, replay result, and audit record in one transaction.

Quotes are mutable only while in draft. Sending freezes the current version;
negotiation creates a new version while retaining the issued item snapshot.
Acceptance creates exactly one order through a transactional idempotency record.
Buyer inquiries must be assigned to a Workspace by a platform operator before
that Workspace can use them as a quote source.

Member invitation tokens are returned only on creation and stored as hashes.
Role changes cannot remove the last Workspace owner. Workspace deactivation is
audited and disables the primary owner; hard deletion is platform-only and
uses database cascades.

Shopify client IDs and secrets are encrypted at rest and always redacted in API
responses. Token and Location caches are isolated by Workspace. Catalog and
inventory changes enqueue synchronization records in the same database
transaction; `app.scripts.process_outbox` performs remote GraphQL work outside
the request process and records retry state and errors.

Agent configuration actions encrypt Shopify credentials before persisting the
pending execution. Raw credentials are never added to conversation history,
approval cards, tool events, or error events. The default model gateway is a
deterministic offline implementation. Setting `MEKYRO_AGENT_API_KEY` selects an
OpenAI-compatible async gateway configured by `MEKYRO_AGENT_BASE_URL`,
`MEKYRO_AGENT_MODEL`, and `MEKYRO_AGENT_TIMEOUT_SECONDS`. The gateway publishes
the complete Agent tool registry as function schemas and maps provider,
protocol, and argument failures to the stable public Agent error boundary. The
approval and Workspace authorization rules remain inside the application and
are never delegated to the model provider.

Model-originated tool calls and complete public tool results are persisted as
structured conversation messages. After all tools in one model response have
completed, their results are sent back to the provider so it can produce a
final answer or request another tool. The same continuation occurs after every
tool in an approval-gated write plan has been approved or rejected. A bounded
five-step loop prevents an external provider from generating unbounded tool
traffic. Direct `run_tool` actions remain deterministic and do not create
orphan provider tool messages.

## Next boundaries

PostgreSQL deployment will run the existing Alembic migrations and add
database-specific concurrency tests for idempotent commands. The outbox worker
already uses atomic claims with expiring leases; production deployment still
needs exported worker metrics and centralized alerting.
