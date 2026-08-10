# Django to FastAPI Feature Parity

This document is the completion contract for the functional rebuild. Django
URLs, service methods, and persisted business behavior are mapped to FastAPI
capabilities. Separate Django URL families may map to one Workspace-scoped
FastAPI command when role checks preserve the original operational boundary.

Status values:

- `Done`: implemented and covered by the default pytest suite.
- `Partial`: some behavior exists, but the Django capability is not complete.
- `Planned`: not implemented in FastAPI yet.

## Authentication and users

| ID | Django capability | FastAPI target | Status |
|---|---|---|---|
| AUTH-001 | Username/password login and vendor login | Unified JWT login with role/workspace claims resolved server-side | Done |
| AUTH-002 | Current user information | Authenticated `/auth/me` | Done |
| AUTH-003 | User language update | Update current user language | Done |
| AUTH-004 | SMS code issue with captcha and rate limits | Pluggable SMS challenge issue endpoint | Done |
| AUTH-005 | SMS login and vendor SMS login | Unified one-time SMS challenge login | Done |
| AUTH-006 | Email code issue with rate limits | Pluggable email challenge issue endpoint | Done |
| AUTH-007 | Email login and vendor email login | Unified one-time email challenge login | Done |
| AUTH-008 | User account activation checks | Reject inactive accounts | Done |

## Workspaces and supplier accounts

| ID | Django capability | FastAPI target | Status |
|---|---|---|---|
| WS-001 | List supplier Workspaces | Membership-scoped ordered Workspace list with total pagination metadata | Done |
| WS-002 | Create supplier account and Workspace | Operator-only transactional provisioning | Done |
| WS-003 | Supplier account detail | Workspace and owner account detail | Done |
| WS-004 | Update supplier account and site configuration | Workspace/account update command | Done |
| WS-005 | Disable or delete supplier account | Audited soft/hard lifecycle commands | Done |
| WS-006 | Workspace prompt configuration | Versioned prompt configuration | Done |
| WS-007 | Supplier profile read/update | Workspace profile API | Done |
| WS-008 | Workspace member roles | Owner/admin/member authorization and invitations | Done |
| WS-009 | Onboarding state and lead requirement | Explicit three-step onboarding state machine | Done |
| WS-010 | Legacy onboarding profile compatibility | Migrate legacy requirement fields and protect active executions | Done |

## Leads and contact logs

| ID | Django capability | FastAPI target | Status |
|---|---|---|---|
| LEAD-001 | External/internal/supplier lead list and detail | Workspace-scoped filtered list/detail with legacy platform/page compatibility | Done |
| LEAD-002 | Create lead | Audited create command | Done |
| LEAD-003 | Batch create leads | Atomic batch command | Done |
| LEAD-004 | Update lead fields and stage | Controlled update and stage transitions | Done |
| LEAD-005 | Delete lead | Audited delete command | Done |
| CONTACT-001 | Lead contact-log list/detail | Workspace-scoped activity list | Done |
| CONTACT-002 | Create contact log | Audited activity create command | Done |
| CONTACT-003 | Batch create contact logs | Transactional batch command | Done |
| CONTACT-004 | Update contact log | Audited update command | Done |
| CONTACT-005 | Delete contact log | Audited delete command | Done |
| CONTACT-006 | Workspace-wide contact-log search | Paginated cross-lead activity view | Done |
| DASH-001 | Supplier home statistics | Workspace dashboard aggregates | Done |

## Inquiries

| ID | Django capability | FastAPI target | Status |
|---|---|---|---|
| INQ-001 | Public supplier inquiry submission | Validated public supplier inquiry | Done |
| INQ-002 | Public buyer inquiry submission | Validated public buyer inquiry | Done |
| INQ-003 | Internal supplier inquiry list/detail | Operator inquiry work queue | Done |
| INQ-004 | Internal buyer inquiry list/detail | Operator inquiry work queue | Done |
| INQ-005 | Inquiry status/content update | Audited inquiry update | Done |
| INQ-006 | Inquiry delete | Audited inquiry delete | Done |
| INQ-007 | Assign buyer inquiry to a supplier | Operator-controlled Workspace assignment | Done |

## Quotes

The project plan requires the inquiry-to-quote-to-order transaction loop even
though the Django repository does not expose a complete quote implementation.

| ID | Planned capability | FastAPI target | Status |
|---|---|---|---|
| QUOTE-001 | Quote list/detail/create | Workspace quote aggregate with customer snapshot | Done |
| QUOTE-002 | Draft quote editing | Audited items, prices, charges, terms and validity updates | Done |
| QUOTE-003 | Send, accept and reject | Explicit guarded quote state transitions | Done |
| QUOTE-004 | Negotiation history | Immutable issued revisions and item snapshots | Done |
| QUOTE-005 | Lead and inquiry linkage | Tenant-checked lead or assigned buyer inquiry source | Done |
| QUOTE-006 | Accepted quote to order | Idempotent transactional order conversion | Done |
| QUOTE-007 | Quote conversion statistics | Workspace dashboard quote aggregates | Done |

## Catalog and inventory

| ID | Django capability | FastAPI target | Status |
|---|---|---|---|
| CAT-001 | Category list | Workspace category tree/list | Done |
| CAT-002 | Category create/update/delete with depth rules | Audited category commands | Done |
| PROD-001 | Product list/detail and filters | Workspace product list/detail | Done |
| PROD-002 | Product create/update | Audited product commands | Done |
| PROD-003 | Product soft delete/trash/restore | Audited lifecycle commands | Done |
| PROD-004 | Product image list/create/delete | Storage-backed product media | Done |
| PROD-005 | Product CSV/XLSX template, validate and import | Staged XLSX import workflow | Done |
| SKU-001 | SKU list/detail and filters | Workspace variant list/detail with multi-specification AND filtering | Done |
| SKU-002 | SKU create/update | Audited variant commands | Done |
| SKU-003 | SKU soft delete/trash/restore | Audited variant lifecycle | Done |
| SKU-004 | SKU specification option aggregation | Workspace specification options | Done |
| PRICE-001 | Replace one SKU's price tiers | Atomic price-tier replacement | Done |
| PRICE-002 | Batch replace price tiers | Transactional batch replacement | Done |
| INV-001 | Inventory log list | Workspace movement list with actor, search, filters, ordering and canonical/legacy pagination metadata | Done |
| INV-002 | Create inventory log and update stock | Idempotent transactional adjustment | Done |
| INV-003 | Per-SKU batch inventory logs | Idempotent batch command | Done |
| INV-004 | Cross-SKU batch inventory logs | Idempotent batch command | Done |
| SKU-005 | Batch update SKUs | Transactional batch update | Done |

## Orders and shipping

The Django repository persists these models but does not expose completed URL
handlers. They remain parity requirements because other Django domains and the
project plan treat them as business objects.

| ID | Django capability | FastAPI target | Status |
|---|---|---|---|
| ORDER-001 | Order persistence and lead relation | Workspace order list/detail/create | Done |
| ORDER-002 | Order items linked to SKUs | Transactional order item commands | Done |
| ORDER-003 | Order and payment statuses | Validated status transitions | Done |
| SHIP-001 | Shipping records | Shipment create/update/detail | Done |
| SHIP-002 | Shipping status and tracking | Audited tracking transitions | Done |

## API keys

| ID | Django capability | FastAPI target | Status |
|---|---|---|---|
| KEY-001 | Create API key and reveal secret once | Hashed scoped key issue command | Done |
| KEY-002 | Paginated API key list | Metadata-only operator list | Done |
| KEY-003 | Update key name and permissions | Audited key update | Done |
| KEY-004 | Enable/disable key | Audited status command | Done |
| KEY-005 | Delete/revoke key | Irreversible revoke command | Done |
| KEY-006 | Authenticate with scoped API key | Permission-aware API key dependency and external CRM/catalog routes | Done |
| KEY-007 | Read Workspace prompt with API key | Immutable key-tenant scoped prompt endpoint | Done |

## Shopify

| ID | Django capability | FastAPI target | Status |
|---|---|---|---|
| SHOP-001 | List Workspace Shopify configurations | Secret-redacted operator list | Done |
| SHOP-002 | Create/update configuration | Encrypted credential command | Done |
| SHOP-003 | Enable/disable synchronization | Validated status command | Done |
| SHOP-004 | Delete configuration | Audited disconnect command | Done |
| SHOP-005 | OAuth/client-credential token cache and refresh | Async Shopify client adapter | Done |
| SHOP-006 | GraphQL execution, retry and error mapping | Resilient Shopify gateway | Done |
| SHOP-007 | Location discovery/cache | Workspace Shopify location resolver | Done |
| SHOP-008 | Product synchronization tool | Transactional outbox, retry worker and catalog/inventory synchronization | Done |
| SHOP-009 | Supplier self-service Shopify configuration | Role-guarded encrypted Workspace configuration | Done |

## Agent and onboarding

| ID | Django capability | FastAPI target | Status |
|---|---|---|---|
| AGENT-001 | Authenticated SSE chat | Streaming agent endpoint | Done |
| AGENT-002 | Lead read tools | Tenant-safe CRM tool adapter | Done |
| AGENT-003 | Product read/write tools | Approval-aware catalog tool adapter | Done |
| AGENT-004 | Inventory adjustment tool | Approval and idempotency wrapper | Done |
| AGENT-005 | Workspace and Shopify configuration tools | Secret-safe configuration adapter | Done |
| AGENT-006 | Onboarding cards, confirm/cancel/back/pause | Persistent onboarding state machine | Done |
| AGENT-007 | Duplicate execution prevention and recovery | Command execution ledger | Done |
| AGENT-008 | AI input optimization and safe fallback | Configurable OpenAI-compatible model gateway with complete tool schemas and deterministic fallback | Done |
| AGENT-009 | Internal error redaction in SSE | Stable public error contract | Done |
| AGENT-010 | Tool result continuation and final response | Persisted tool-call/result history with bounded multi-round model continuation, including approved writes | Done |

## Cross-cutting completion gates

| ID | Requirement | Status |
|---|---|---|
| PLATFORM-001 | Alembic migrations for every persisted model | Done |
| PLATFORM-002 | PostgreSQL integration and concurrency suite | Planned |
| PLATFORM-003 | Transactional outbox and retrying worker | Done |
| PLATFORM-004 | Structured logs, metrics and request correlation | Partial |
| PLATFORM-005 | Rate limiting and external-input abuse protection | Partial |
| PLATFORM-006 | Full role/tenant negative-test matrix | Partial |
| PLATFORM-007 | Fake database covers every domain and lifecycle | Partial |
| PLATFORM-008 | Every `Done` row maps to a default pytest test | Done |
| PLATFORM-009 | Platform cross-Workspace operational read models | Done |

## Remaining hardening work

The functional API rebuild is complete for the Django route families. The
remaining items are deployment and production-hardening work rather than
missing business commands:

1. `PLATFORM-002`: run the migration and concurrency suite against a real
   PostgreSQL service in CI; SQLite is intentionally retained for local fake
   database development.
2. `PLATFORM-004`: export the process-local counters and structured request
   logs to the production observability stack (for example Prometheus and a
   centralized log sink). Correlation IDs are already returned on every HTTP
   response.
3. `PLATFORM-005`: move the public-input limiter to a shared store such as
   Redis and add WAF/body-size controls for internet-facing deployments. The
   local fixed-window limiter is active for public inquiry submission.
4. `PLATFORM-006`: every Workspace GET/write route and cross-tenant GET route
   is covered by a generated matrix. Concurrent ownership and invitation races
   still require the PostgreSQL suite.
5. `PLATFORM-007`: every persisted model has at least one deterministic fake
   record. More terminal-state fixtures are still useful for Shopify, outbox,
   onboarding, quote, order and shipping demonstrations.
