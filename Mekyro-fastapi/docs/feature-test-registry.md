# Feature Test Registry

This registry is the acceptance index for the FastAPI functional rebuild. A
feature is marked implemented only when its automated test is part of the
default `pytest` run.

| ID | Feature point | Automated test | Status |
|---|---|---|---|
| HEALTH-001 | Service and database health | `test_health_checks_database` | Implemented |
| AUTH-001 | Username, email and phone password login, vendor boundary, and JWT issue | `test_login_and_current_user`, `test_password_login_supports_phone_and_vendor_boundary` | Implemented |
| AUTH-002 | Invalid credentials rejected | `test_invalid_password_is_rejected` | Implemented |
| AUTH-003 | Update language and profile fields | `test_user_language_profile_and_workspace_prompt_are_audited` | Implemented |
| AUTH-004 | SMS challenge with CAPTCHA and persisted rate limits | `test_sms_challenge_requires_captcha_and_supports_vendor_login`, `test_challenge_ip_hourly_limit_uses_persisted_fake_database` | Implemented |
| AUTH-005 | One-time SMS and vendor challenge login | `test_sms_challenge_requires_captcha_and_supports_vendor_login` | Implemented |
| AUTH-006 | Email challenge with interval, IP and daily limits | `test_challenge_issue_interval_and_attempt_lockout`, `test_challenge_target_daily_limit_and_expiry` | Implemented |
| AUTH-007 | Hashed one-time email and vendor challenge login | `test_email_challenge_login_is_hashed_one_time_and_issues_jwt`, `test_vendor_challenge_login_rejects_user_without_workspace` | Implemented |
| AUTH-008 | Inactive account authentication and lifecycle checks | `test_platform_supplier_account_detail_update_deactivate_reactivate_and_hard_delete` | Implemented |
| WS-001 | Membership-scoped ordered Workspace list with total pagination metadata | `test_supplier_only_lists_own_workspace`, `test_platform_admin_lists_all_workspaces` | Implemented |
| WS-002 | Operator provisions supplier account and Workspace | `test_platform_admin_registers_supplier_that_can_login` | Implemented |
| TENANT-001 | Supplier sees only own Workspace | `test_supplier_only_lists_own_workspace` | Implemented |
| TENANT-002 | Cross-tenant workspace rejected | `test_supplier_cannot_access_another_workspace` | Implemented |
| TENANT-003 | Resource ID cannot escape tenant scope | `test_lead_id_cannot_escape_workspace_scope` | Implemented |
| REG-001 | Operator provisions supplier and Workspace | `test_platform_admin_registers_supplier_that_can_login` | Implemented |
| REG-002 | Supplier cannot provision another supplier | `test_supplier_cannot_register_another_supplier` | Implemented |
| REG-003 | Duplicate supplier identity rejected | `test_duplicate_supplier_identity_is_rejected` | Implemented |
| WS-003 | Supplier account detail and secret redaction | `test_platform_supplier_account_detail_update_deactivate_reactivate_and_hard_delete` | Implemented |
| WS-004 | Supplier account and site configuration update | `test_platform_supplier_account_detail_update_deactivate_reactivate_and_hard_delete` | Implemented |
| WS-005 | Soft deactivate, reactivate and hard delete | `test_platform_supplier_account_detail_update_deactivate_reactivate_and_hard_delete` | Implemented |
| WS-006 | Versioned Workspace prompt configuration | `test_user_language_profile_and_workspace_prompt_are_audited` | Implemented |
| WS-007 | Workspace self profile read/update | `test_user_language_profile_and_workspace_prompt_are_audited` | Implemented |
| WS-008 | Member invitation, acceptance, roles and removal | `test_member_invitation_acceptance_roles_and_last_owner_guard` | Implemented |
| WS-009 | Three-step onboarding state machine | `test_onboarding_three_steps_apply_confirm_pause_back_restart_and_finish` | Implemented |
| WS-010 | Legacy onboarding requirement migration and active-execution protection | `test_supplier_profile_migrates_legacy_requirement_and_protects_active_execution`, `test_supplier_profile_requirement_change_invalidates_pending_lead_card` | Implemented |
| LEAD-001 | Workspace/API-key scoped filtered lead list and detail, including legacy platform/page filters, tenant identity and latest contact enrichment | `test_filtered_leads_and_activities`, `test_external_api_key_crm_full_lifecycle_and_batches`, `test_agent_authenticated_sse_chat_persists_and_resumes_conversation` | Implemented |
| LEAD-002 | Audited lead creation | `test_lead_write_workflow_is_audited` | Implemented |
| LEAD-003 | Atomic lead batch creation | `test_external_api_key_crm_full_lifecycle_and_batches` | Implemented |
| LEAD-004 | Controlled lead updates and stage transitions | `test_lead_batch_full_update_and_delete_preserves_order` | Implemented |
| LEAD-005 | Audited lead deletion | `test_lead_batch_full_update_and_delete_preserves_order` | Implemented |
| CONTACT-001 | Lead contact-log list and detail | `test_filtered_leads_and_activities` | Implemented |
| CONTACT-002 | Audited contact-log creation | `test_lead_write_workflow_is_audited` | Implemented |
| CONTACT-003 | Transactional contact-log batch creation | `test_external_api_key_crm_full_lifecycle_and_batches` | Implemented |
| CONTACT-004 | Audited contact-log update | `test_contact_activity_batch_search_update_and_delete` | Implemented |
| CONTACT-005 | Audited contact-log deletion | `test_contact_activity_batch_search_update_and_delete` | Implemented |
| CONTACT-006 | Workspace-wide contact-log search | `test_contact_activity_batch_search_update_and_delete` | Implemented |
| CRM-001 | Filter and read leads | `test_filtered_leads_and_activities` | Implemented |
| CRM-002 | Create a validated lead | `test_lead_write_workflow_is_audited`, `test_crm_rejects_invalid_lead_and_contact_email_fields` | Implemented |
| CRM-003 | Enforce lead stage transitions | `test_lead_write_workflow_is_audited` | Implemented |
| CRM-004 | Add validated contact activity | `test_lead_write_workflow_is_audited`, `test_crm_rejects_invalid_lead_and_contact_email_fields` | Implemented |
| CRM-005 | Reject cross-tenant activity write | `test_crm_writes_cannot_use_cross_tenant_lead_id` | Implemented |
| CRM-006 | Batch lead create and full-field update | `test_lead_batch_full_update_and_delete_preserves_order` | Implemented |
| CRM-007 | Lead delete preserves related order | `test_lead_batch_full_update_and_delete_preserves_order` | Implemented |
| CRM-008 | Batch contact activities | `test_contact_activity_batch_search_update_and_delete` | Implemented |
| CRM-009 | Workspace activity search/detail/update/delete | `test_contact_activity_batch_search_update_and_delete` | Implemented |
| CRM-010 | Lead batch atomic rollback | `test_crm_batch_rolls_back_on_duplicate_reference` | Implemented |
| INQ-001 | Anonymous supplier inquiry submission | `test_public_inquiry_submission_and_operator_management` | Implemented |
| INQ-002 | Anonymous buyer inquiry submission | `test_public_inquiry_submission_and_operator_management` | Implemented |
| INQ-003 | Operator inquiry search/detail/update/delete | `test_public_inquiry_submission_and_operator_management` | Implemented |
| INQ-004 | Public inquiry input validation | `test_public_inquiry_validation_rejects_invalid_contact_data` | Implemented |
| INQ-005 | Assign buyer inquiry to Workspace | `test_quote_enforces_assigned_inquiry_and_tenant_catalog_boundaries` | Implemented |
| INQ-006 | Audited inquiry deletion | `test_public_inquiry_submission_and_operator_management` | Implemented |
| INQ-007 | Operator-controlled buyer inquiry assignment | `test_quote_enforces_assigned_inquiry_and_tenant_catalog_boundaries` | Implemented |
| QUOTE-001 | Quote create/list/detail and amount calculation | `test_quote_draft_send_revision_and_rejection_preserves_version_history` | Implemented |
| QUOTE-002 | Draft update and issued quote locking | `test_quote_draft_send_revision_and_rejection_preserves_version_history` | Implemented |
| QUOTE-003 | Send, revise and reject state transitions | `test_quote_draft_send_revision_and_rejection_preserves_version_history` | Implemented |
| QUOTE-004 | Immutable version and item history | `test_quote_draft_send_revision_and_rejection_preserves_version_history` | Implemented |
| QUOTE-005 | Lead, inquiry, SKU and tenant boundaries | `test_quote_enforces_assigned_inquiry_and_tenant_catalog_boundaries` | Implemented |
| QUOTE-006 | Idempotent accepted-quote conversion | `test_accepted_quote_creates_one_idempotent_order` | Implemented |
| QUOTE-007 | Dashboard quote conversion statistics | `test_dashboard_uses_real_fake_database_aggregates` | Implemented |
| ORDER-001 | Idempotent order create and amount calculation | `test_order_items_status_shipping_and_idempotency` | Implemented |
| ORDER-002 | Pending order item replacement | `test_order_items_status_shipping_and_idempotency` | Implemented |
| ORDER-003 | Order and payment status transitions | `test_order_items_status_shipping_and_idempotency` | Implemented |
| ORDER-004 | Reject cross-tenant lead and SKU | `test_order_rejects_cross_tenant_lead_and_variant` | Implemented |
| SHIP-001 | Shipment create and status transitions | `test_order_items_status_shipping_and_idempotency` | Implemented |
| SHIP-002 | Audited shipping status and tracking transitions | `test_order_items_status_shipping_and_idempotency` | Implemented |
| AUDIT-002 | Platform and anonymous audit events | `test_public_inquiry_submission_and_operator_management` | Implemented |
| CAT-001 | Products include variants and tiers | `test_products_include_variants_and_price_tiers` | Implemented |
| CAT-002 | Category CRUD, hierarchy and tenant scope | `test_category_crud_enforces_hierarchy_and_tenant_scope` | Implemented |
| CAT-003 | Category depth and subtree deletion | `test_category_depth_and_delete_subtree_behavior` | Implemented |
| PROD-001 | Transactional product, nested SKU, price-tier and media create/update | `test_product_and_variant_write_workflow_is_atomic_and_audited`, `test_product_create_atomically_persists_nested_gallery_detail_and_sku_images` | Implemented |
| PROD-002 | Product recycle bin lifecycle | `test_product_and_variant_recycle_bin_lifecycle` | Implemented |
| SKU-001 | Variant list, detail and update | `test_product_and_variant_write_workflow_is_atomic_and_audited` | Implemented |
| SKU-002 | Variant recycle bin lifecycle | `test_product_and_variant_recycle_bin_lifecycle` | Implemented |
| PRICE-001 | Atomic price-tier replacement | `test_product_and_variant_write_workflow_is_atomic_and_audited` | Implemented |
| CAT-004 | Catalog resource tenant isolation | `test_catalog_resource_ids_cannot_escape_workspace` | Implemented |
| CAT-005 | Product and flat-SKU category, brand, stock, status, multi-specification AND and ordering filters | `test_catalog_filters_and_flat_variant_metadata`, `test_external_api_key_catalog_variant_price_and_inventory_batches`, `test_platform_catalog_supports_category_brand_stock_and_variant_filters`, `test_platform_operator_cross_workspace_read_models_and_dashboard` | Implemented |
| PROD-003 | Product and SKU permanent deletion | `test_product_and_variant_permanent_delete_requires_trash` | Implemented |
| PROD-004 | Product image list, create and delete | `test_catalog_upload_and_product_image_lifecycle` | Implemented |
| PROD-005 | XLSX template, preview and transactional import | `test_product_import_template_preview_and_confirm` | Implemented |
| MEDIA-001 | Local upload and media retrieval | `test_catalog_upload_and_product_image_lifecycle` | Implemented |
| MEDIA-002 | Product/detail/SKU image lifecycle | `test_catalog_upload_and_product_image_lifecycle` | Implemented |
| MEDIA-003 | Product-image ownership validation | `test_product_image_rejects_cross_product_variant` | Implemented |
| IMPORT-001 | Download XLSX import template | `test_product_import_template_preview_and_confirm` | Implemented |
| IMPORT-002 | Preview and validate XLSX rows | `test_product_import_preview_reports_invalid_rows` | Implemented |
| IMPORT-003 | Confirm transactional XLSX import | `test_product_import_template_preview_and_confirm` | Implemented |
| SKU-003 | Workspace specification options | `test_specification_options_are_aggregated_per_workspace` | Implemented |
| SKU-004 | Workspace SKU specification option aggregation | `test_specification_options_are_aggregated_per_workspace` | Implemented |
| PRICE-002 | Transactional batch price-tier replacement | `test_catalog_batch_commands_are_atomic_and_idempotent` | Implemented |
| SKU-005 | Transactional batch SKU update | `test_catalog_batch_commands_are_atomic_and_idempotent` | Implemented |
| BATCH-001 | Atomic batch SKU update | `test_catalog_batch_commands_are_atomic_and_idempotent` | Implemented |
| BATCH-002 | Atomic batch price-tier replacement | `test_catalog_batch_commands_are_atomic_and_idempotent` | Implemented |
| BATCH-003 | Idempotent cross-SKU inventory batch | `test_catalog_batch_commands_are_atomic_and_idempotent` | Implemented |
| INV-001 | Workspace, platform and API-key inventory movement actor, search, filter, ordering and legacy/canonical pagination | `test_inventory_movements_are_tenant_scoped`, `test_platform_operator_cross_workspace_read_models_and_dashboard`, `test_external_api_key_catalog_variant_price_and_inventory_batches` | Implemented |
| INV-002 | Transactional inventory adjustment, replay, conflict, audit and tenant boundary | `test_inventory_adjustment_is_idempotent_and_audited`, `test_idempotency_key_rejects_different_inventory_request`, `test_inventory_adjustment_rejects_negative_stock_and_cross_tenant_variant` | Implemented |
| INV-003 | Idempotent per-SKU inventory batch | `test_external_api_key_catalog_variant_price_and_inventory_batches` | Implemented |
| INV-004 | Idempotent cross-SKU inventory batch | `test_catalog_batch_commands_are_atomic_and_idempotent`, `test_external_api_key_catalog_variant_price_and_inventory_batches` | Implemented |
| INV-005 | Inventory movement type direction | `test_inventory_movement_type_enforces_quantity_direction` | Implemented |
| AUDIT-001 | Record and query business writes | `test_lead_write_workflow_is_audited` | Implemented |
| DASH-001 | Dashboard uses persisted lead/catalog/order aggregates | `test_dashboard_uses_real_fake_database_aggregates` | Implemented |
| DASH-002 | Dashboard includes quote conversion aggregates | `test_dashboard_uses_real_fake_database_aggregates` | Implemented |
| KEY-001 | Issue API key and reveal raw secret once | `test_api_key_lifecycle_reveals_secret_once_and_requires_disable_before_revoke` | Implemented |
| KEY-002 | Paginated metadata-only API key list | `test_api_key_lifecycle_reveals_secret_once_and_requires_disable_before_revoke` | Implemented |
| KEY-003 | Update API key name, permissions and Workspace | `test_api_key_admin_update_and_non_admin_protection` | Implemented |
| KEY-004 | Enable and disable API key | `test_disabled_api_key_is_rejected` | Implemented |
| KEY-005 | Revoke only after disabling | `test_api_key_lifecycle_reveals_secret_once_and_requires_disable_before_revoke` | Implemented |
| KEY-006 | X-Api-Key permission and tenant-scoped external CRM/catalog access | `test_api_key_auth_permission_tenant_scope_and_last_used`, `test_api_key_catalog_and_inventory_commands_use_key_workspace` | Implemented |
| KEY-007 | API key reads prompt only from its immutable Workspace scope | `test_api_key_reads_workspace_prompt_from_its_immutable_tenant_scope` | Implemented |
| SHOP-001 | List all Workspaces with secret-redacted Shopify configuration | `test_shopify_config_lifecycle_encrypts_and_redacts_credentials` | Implemented |
| SHOP-002 | Create/update configuration with encrypted credentials | `test_shopify_config_lifecycle_encrypts_and_redacts_credentials` | Implemented |
| SHOP-003 | Validate Shopify configuration before enabling | `test_shopify_config_lifecycle_encrypts_and_redacts_credentials` | Implemented |
| SHOP-004 | Delete only inactive Shopify configuration | `test_shopify_config_lifecycle_encrypts_and_redacts_credentials` | Implemented |
| SHOP-005 | Cache and refresh Workspace-scoped access tokens | `test_shopify_client_token_graphql_retry_and_location_cache`, `test_shopify_client_refreshes_401_and_maps_graphql_errors` | Implemented |
| SHOP-006 | Retry and map Shopify GraphQL failures | `test_shopify_client_token_graphql_retry_and_location_cache`, `test_shopify_client_refreshes_401_and_maps_graphql_errors` | Implemented |
| SHOP-007 | Discover and cache active Shopify Location | `test_shopify_client_token_graphql_retry_and_location_cache` | Implemented |
| SHOP-008 | Idempotent outbox-backed product and inventory synchronization | `test_shopify_sync_job_is_workspace_scoped_and_idempotent`, `test_shopify_outbox_worker_syncs_catalog_inventory_and_remote_ids`, `test_active_shopify_config_enqueues_catalog_inventory_and_delete_events` | Implemented |
| SHOP-009 | Supplier self-service encrypted Shopify configuration | `test_supplier_can_manage_own_shopify_profile_with_encrypted_credentials` | Implemented |
| AGENT-001 | Authenticated persistent SSE chat | `test_agent_authenticated_sse_chat_persists_and_resumes_conversation` | Implemented |
| AGENT-002 | Tenant-safe lead read tools | `test_agent_lead_tools_are_tenant_scoped_and_cover_django_read_contract` | Implemented |
| AGENT-003 | Approval-aware product, SKU and import tools | `test_agent_product_write_requires_approval_and_duplicate_confirmation_is_idempotent`, `test_agent_catalog_write_adapters_cover_product_sku_update_delete_and_import` | Implemented |
| AGENT-004 | Approved idempotent inventory adjustment | `test_agent_inventory_adjustment_uses_approval_and_business_idempotency` | Implemented |
| AGENT-005 | Secret-safe Workspace and Shopify configuration tools | `test_agent_configuration_tool_encrypts_and_never_streams_secrets` | Implemented |
| AGENT-006 | Persistent onboarding cards and actions | `test_agent_onboarding_resume_card_confirm_pause_continue_and_duplicate_apply` | Implemented |
| AGENT-007 | Execution-key deduplication, rejection and recovery | `test_agent_execution_key_deduplicates_pending_approval_and_rejects_mismatch`, `test_agent_result_unknown_can_be_reconciled_without_reexecuting_unsafe_tool` | Implemented |
| AGENT-008 | Configurable OpenAI-compatible model gateway, deterministic fallback and complete toolkit schemas | `test_agent_registry_and_model_gateway_cover_all_django_toolkits`, `test_agent_openai_tool_schemas_cover_complete_registry`, `test_create_app_selects_configured_openai_compatible_gateway`, `test_openai_compatible_gateway_sends_history_tools_and_parses_tool_calls`, `test_openai_compatible_gateway_maps_http_and_invalid_argument_failures` | Implemented |
| AGENT-009 | Stable redacted SSE errors | `test_agent_internal_gateway_and_tool_errors_are_redacted_from_sse` | Implemented |
| AGENT-010 | Complete persisted tool results, bounded model continuation and final text after read or approved write tools | `test_openai_compatible_gateway_sends_tool_results_for_continuation`, `test_agent_registry_and_model_gateway_cover_all_django_toolkits`, `test_agent_resumes_model_after_approved_write_tool` | Implemented |
| PLATFORM-001 | Alembic empty-database upgrade, model parity, drift and downgrade | `test_alembic_upgrades_empty_database_to_all_models_without_schema_drift`, `test_alembic_initial_schema_downgrades_cleanly` | Implemented |
| PLATFORM-003 | Transactional outbox retry, atomic multi-worker claim and expired-lease recovery | `test_shopify_outbox_worker_syncs_catalog_inventory_and_remote_ids`, `test_shopify_outbox_worker_records_retryable_failure`, `test_shopify_outbox_claim_is_atomic_and_expired_lease_is_recoverable` | Implemented |
| PLATFORM-008 | Every Done feature ID maps to a real default pytest | `test_done_feature_ids_have_registered_default_pytest` | Implemented |
| PLATFORM-009 | Filtered, ordered and total-paginated platform cross-Workspace leads, contacts, categories, specifications, catalog trash, inventory and dashboard reads | `test_platform_operator_cross_workspace_read_models_and_dashboard`, `test_platform_catalog_supports_category_brand_stock_and_variant_filters`, `test_platform_cross_workspace_categories_specifications_and_trash`, `test_platform_operator_uses_workspace_commands_for_audited_writes` | Implemented |
| PLATFORM-004 | Request correlation headers, structured request event fields and process-local metrics | `test_request_correlation_id_is_preserved_and_metrics_are_recorded`, `test_invalid_request_id_is_replaced` | Implemented |
| PLATFORM-005 | Public inquiry fixed-window abuse protection with retry headers | `test_public_inquiry_rate_limit_returns_retry_contract` | Implemented |
| PLATFORM-006 | Every Workspace GET/write route member-role matrix and every Workspace GET cross-tenant matrix | `test_member_read_and_write_permissions_cover_every_workspace_route`, `test_cross_workspace_account_is_denied_by_every_workspace_read_route`, `test_admin_business_writes_owner_boundaries_and_member_agent_guard` | Implemented |
| PLATFORM-007 | Deterministic fake database sample for every persisted model and API-key read smoke | `test_fake_database_covers_every_persisted_domain`, `test_fake_api_key_exercises_aurora_read_models` | Implemented |

Run all registered tests with:

```bash
.venv/bin/pytest -q
```
