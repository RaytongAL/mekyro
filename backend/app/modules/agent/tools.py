import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import record_audit
from app.core.config import Settings
from app.core.dependencies import WorkspaceContext
from app.core.models import (
    ContactActivity,
    Lead,
    Product,
    ProductVariant,
    ShopifyConfig,
    new_id,
)
from app.core.secrets import decrypt_secret, encrypt_secret, mask_secret
from app.modules.catalog.import_router import (
    ImportConfirmRequest,
    ProductImportRow,
    _parse_workbook,
    confirm_product_import,
)
from app.modules.catalog.router import (
    InventoryAdjustmentRequest,
    ProductCreateRequest,
    ProductResponse,
    ProductUpdateRequest,
    VariantCreateRequest,
    VariantResponse,
    VariantUpdateRequest,
    adjust_inventory,
    create_product,
    create_variant,
    delete_product,
    delete_variant,
    get_product,
    get_variant,
    list_products,
    list_variants,
    update_product,
    update_variant,
)
from app.modules.shopify.client import clear_shopify_caches
from app.modules.shopify.router import _normalize_store_url
from app.modules.workspaces.onboarding_router import (
    ApplyRequest,
    ConfirmRequest,
    DraftRequest,
    apply_card,
    back_onboarding,
    cancel_card,
    confirm_step,
    continue_onboarding,
    finish_onboarding,
    normalize_state,
    pause_onboarding,
    restart_onboarding,
    save_draft,
)


def _json_model(value) -> dict:
    return value.model_dump(mode="json")


def _json_product(value: Product) -> dict:
    return ProductResponse.model_validate(value).model_dump(mode="json")


def _json_variant(value: ProductVariant) -> dict:
    return VariantResponse.model_validate(value).model_dump(mode="json")


def _page(arguments: dict, *, maximum: int = 100) -> tuple[int, int, int]:
    page = max(1, int(arguments.get("page") or 1))
    page_size = min(maximum, max(1, int(arguments.get("page_size") or 20)))
    return page, page_size, (page - 1) * page_size


async def _lead_tool(
    name: str,
    arguments: dict,
    context: WorkspaceContext,
    session: AsyncSession,
) -> dict:
    workspace_id = context.workspace.id
    if name == "lead_list_leads":
        page, page_size, offset = _page(arguments, maximum=50)
        filters = [Lead.workspace_id == workspace_id]
        if arguments.get("country"):
            filters.append(Lead.country == str(arguments["country"]).upper())
        if arguments.get("stage"):
            filters.append(Lead.stage == arguments["stage"])
        total = await session.scalar(select(func.count()).select_from(Lead).where(*filters)) or 0
        latest_contact_at = (
            select(func.max(ContactActivity.created_at))
            .where(ContactActivity.lead_id == Lead.id)
            .correlate(Lead)
            .scalar_subquery()
        )
        rows = (
            await session.execute(
                select(Lead, latest_contact_at.label("latest_contact_at"))
                .where(*filters)
                .order_by(Lead.created_at.desc())
                .limit(page_size)
                .offset(offset)
            )
        ).all()
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "results": [
                {
                    "id": item.id,
                    "workspace_id": item.workspace_id,
                    "merchant_name": item.merchant_name,
                    "company_name": item.company_name,
                    "country": item.country,
                    "stage": item.stage,
                    "contact_person": item.contact_person,
                    "email": item.email,
                    "recommendation_score": item.recommendation_score,
                    "latest_contact_at": latest.isoformat() if latest else None,
                }
                for item, latest in rows
            ],
        }
    if name == "lead_count_by_stage":
        rows = (
            await session.execute(
                select(Lead.stage, func.count(Lead.id))
                .where(Lead.workspace_id == workspace_id)
                .group_by(Lead.stage)
                .order_by(func.count(Lead.id).desc())
            )
        ).all()
        total = sum(count for _, count in rows)
        return {
            "total": total,
            "stats": [
                {"stage": stage, "count": count, "ratio": count / total if total else 0}
                for stage, count in rows
            ],
        }
    lead_id = str(arguments.get("lead_id") or "")
    lead = await session.scalar(
        select(Lead).where(Lead.id == lead_id, Lead.workspace_id == workspace_id)
    )
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    if name == "lead_get_detail":
        latest_contact_at = await session.scalar(
            select(func.max(ContactActivity.created_at)).where(ContactActivity.lead_id == lead.id)
        )
        return {
            "id": lead.id,
            "workspace_id": lead.workspace_id,
            "source": lead.source,
            "external_ref": lead.external_ref,
            "merchant_name": lead.merchant_name,
            "company_name": lead.company_name,
            "contact_person": lead.contact_person,
            "country": lead.country,
            "city": lead.city,
            "description": lead.description,
            "email": lead.email,
            "phone": lead.phone,
            "whatsapp": lead.whatsapp,
            "stage": lead.stage,
            "recommendation_score": lead.recommendation_score,
            "recommendation_reason": lead.recommendation_reason,
            "latest_contact_at": latest_contact_at.isoformat() if latest_contact_at else None,
        }
    rows = (
        await session.scalars(
            select(ContactActivity)
            .where(
                ContactActivity.workspace_id == workspace_id,
                ContactActivity.lead_id == lead.id,
            )
            .order_by(ContactActivity.created_at.desc())
        )
    ).all()
    return {
        "total": len(rows),
        "results": [
            {
                "id": item.id,
                "type": item.activity_type,
                "channel": item.channel,
                "direction": item.direction,
                "subject": item.subject,
                "content": item.content,
                "created_at": item.created_at.isoformat(),
            }
            for item in rows
        ],
    }


async def _product_read_tool(
    name: str,
    arguments: dict,
    context: WorkspaceContext,
    session: AsyncSession,
) -> dict:
    if name == "product_list_products":
        page, page_size, offset = _page(arguments)
        response = await list_products(
            context=context,
            session=session,
            search=arguments.get("search"),
            status_filter=arguments.get("status"),
            category_id=arguments.get("category_id"),
            brand_id=arguments.get("brand_id"),
            brand_name=arguments.get("brand_name"),
            stock=arguments.get("stock"),
            ordering="-created_at",
            limit=page_size,
            offset=offset,
        )
        return {
            "total": response.total,
            "page": page,
            "page_size": page_size,
            "results": [_json_product(item) for item in response.items],
        }
    if name == "product_get_detail":
        item = await get_product(str(arguments.get("product_id") or ""), context, session)
        return _json_product(item)
    if name == "product_list_skus":
        page, page_size, offset = _page(arguments)
        items = await list_variants(
            context=context,
            session=session,
            search=arguments.get("search"),
            status_filter=arguments.get("status"),
            stock=arguments.get("stock"),
            category_id=arguments.get("category_id"),
            brand_id=arguments.get("brand_id"),
            brand_name=arguments.get("brand_name"),
            product_id=arguments.get("product_id"),
            spec_key=None,
            spec_value=None,
            ordering="created_at",
            limit=page_size,
            offset=offset,
        )
        return {
            "page": page,
            "page_size": page_size,
            "results": [item.model_dump(mode="json") for item in items],
        }
    if name == "product_download_template":
        return {
            "template_url": (f"/api/v1/workspaces/{context.workspace.id}/product-import/template")
        }
    variant_id = arguments.get("sku_id") or arguments.get("variant_id")
    if variant_id:
        variant = await get_variant(str(variant_id), context, session)
        return _json_variant(variant)
    product_id = str(arguments.get("product_id") or "")
    product = await get_product(product_id, context, session)
    variants = [_json_variant(item) for item in product.variants]
    return {
        "product_id": product.id,
        "product_name": product.name,
        "total_skus": len(variants),
        "total_stock": sum(item["stock_quantity"] for item in variants),
        "out_of_stock_skus": sum(item["stock_quantity"] == 0 for item in variants),
        "skus": variants,
    }


def _variant_payload(raw: dict) -> VariantCreateRequest:
    return VariantCreateRequest.model_validate(
        {
            "sku_code": raw.get("sku_code"),
            "specifications": raw.get("specifications", raw.get("specs", {})),
            "minimum_order_quantity": raw.get("minimum_order_quantity", raw.get("moq", 1)),
            "currency": raw.get("currency", "USD"),
            "stock_quantity": raw.get("stock_quantity", 0),
            "status": raw.get("status", "active"),
            "price_tiers": [
                {
                    "minimum_quantity": item.get("minimum_quantity", item.get("min_quantity")),
                    "unit_price": item.get("unit_price", item.get("price")),
                }
                for item in raw.get("price_tiers", [])
            ],
        }
    )


async def _product_write_tool(
    name: str,
    arguments: dict,
    context: WorkspaceContext,
    session: AsyncSession,
    execution_key: str,
) -> dict:
    if name == "product_create":
        payload = ProductCreateRequest.model_validate(
            {
                "category_id": arguments.get("category_id"),
                "name": arguments.get("name"),
                "description": arguments.get("description", ""),
                "specification_template": arguments.get(
                    "specification_template", arguments.get("spec_template", [])
                ),
                "status": arguments.get("status", "active"),
                "variants": [
                    _variant_payload(item).model_dump(mode="json")
                    for item in arguments.get("variants", arguments.get("skus", []))
                ],
            }
        )
        return {"created": _json_product(await create_product(payload, context, session))}
    if name == "product_update":
        product_id = str(arguments.get("product_id") or "")
        allowed = {
            key: value
            for key, value in arguments.items()
            if key in {"category_id", "name", "description", "status"}
        }
        if "spec_template" in arguments:
            allowed["specification_template"] = arguments["spec_template"]
        if "specification_template" in arguments:
            allowed["specification_template"] = arguments["specification_template"]
        payload = ProductUpdateRequest.model_validate(allowed)
        return {
            "updated": _json_product(await update_product(product_id, payload, context, session))
        }
    if name == "product_delete":
        product_id = str(arguments.get("product_id") or "")
        await delete_product(product_id, context, session)
        return {"deleted": True, "product_id": product_id}
    if name == "product_create_sku":
        product_id = str(arguments.get("product_id") or "")
        variant = await create_variant(product_id, _variant_payload(arguments), context, session)
        return {"created": _json_variant(variant)}
    if name == "product_update_sku":
        variant_id = str(arguments.get("sku_id") or arguments.get("variant_id") or "")
        allowed = {}
        field_map = {
            "sku_code": "sku_code",
            "specs": "specifications",
            "specifications": "specifications",
            "moq": "minimum_order_quantity",
            "minimum_order_quantity": "minimum_order_quantity",
            "currency": "currency",
            "product_name": "product_name",
            "product_category_id": "product_category_id",
            "status": "status",
        }
        for source, target in field_map.items():
            if source in arguments:
                allowed[target] = arguments[source]
        if allowed:
            variant = await update_variant(
                variant_id, VariantUpdateRequest.model_validate(allowed), context, session
            )
        else:
            variant = await get_variant(variant_id, context, session)
        if "stock_quantity" in arguments:
            delta = int(arguments["stock_quantity"]) - variant.stock_quantity
            if delta:
                await adjust_inventory(
                    InventoryAdjustmentRequest(
                        variant_id=variant.id,
                        movement_type="adjustment",
                        quantity_delta=delta,
                        reason="Agent SKU stock update",
                        reference=execution_key,
                    ),
                    context,
                    session,
                    f"{execution_key}:stock",
                )
                variant = await get_variant(variant.id, context, session)
        return {"updated": _json_variant(variant)}
    if name == "product_delete_sku":
        variant_id = str(arguments.get("sku_id") or arguments.get("variant_id") or "")
        await delete_variant(variant_id, context, session)
        return {"deleted": True, "sku_id": variant_id}
    if name == "product_adjust_stock":
        movement_type = str(arguments.get("type") or arguments.get("movement_type") or "")
        quantity = int(arguments.get("quantity", arguments.get("quantity_delta", 0)))
        if movement_type == "inbound":
            quantity = abs(quantity)
        elif movement_type == "outbound":
            quantity = -abs(quantity)
        response = await adjust_inventory(
            InventoryAdjustmentRequest(
                variant_id=str(arguments.get("sku_id") or arguments.get("variant_id") or ""),
                movement_type=movement_type,
                quantity_delta=quantity,
                reason=str(arguments.get("reason") or "Agent inventory adjustment"),
                reference=str(arguments.get("reference_id") or execution_key),
            ),
            context,
            session,
            execution_key,
        )
        return {"adjusted": _json_model(response)}
    rows = arguments.get("rows")
    if rows is None:
        rows = await _download_import_rows(str(arguments.get("file_url") or ""))
    payload = ImportConfirmRequest(rows=[ProductImportRow.model_validate(item) for item in rows])
    result = await confirm_product_import(payload, context, session)
    return {"imported": True, **_json_model(result)}


async def _download_import_rows(file_url: str) -> list[dict]:
    parsed = urlparse(file_url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Import URL must use HTTPS",
        )
    try:
        addresses = await __import__("asyncio").to_thread(
            socket.getaddrinfo, parsed.hostname, parsed.port or 443
        )
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Import host could not be resolved",
        ) from exc
    for item in addresses:
        address = ipaddress.ip_address(item[4][0])
        if not address.is_global:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Import URL must resolve to a public address",
            )
    async with httpx.AsyncClient(follow_redirects=False, timeout=20) as client:
        response = await client.get(file_url, headers={"Accept": "application/octet-stream"})
        response.raise_for_status()
        data = response.content
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Import file exceeds 10 MB")
    rows, errors, _ = _parse_workbook(data)
    if errors or not rows:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "message": "Import workbook is invalid",
                "errors": [e.model_dump() for e in errors],
            },
        )
    return [item.model_dump(mode="json") for item in rows]


async def _config_tool(
    name: str,
    arguments: dict,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
) -> dict:
    config = await session.scalar(
        select(ShopifyConfig).where(ShopifyConfig.workspace_id == context.workspace.id)
    )
    if name == "config_get_profile":
        api_key = decrypt_secret(config.api_key_encrypted, settings) if config else ""
        return {
            "workspace_name": context.workspace.name,
            "description": context.workspace.description,
            "site_type": context.workspace.site_type,
            "lead_acquisition_requirement": (
                context.workspace.prompt or context.workspace.lead_acquisition_requirement
            ),
            "config_id": config.id if config else None,
            "store_url": config.store_url if config else "",
            "api_key_configured": bool(api_key),
            "api_key_masked": mask_secret(api_key),
            "api_secret_key_configured": bool(config and config.api_secret_encrypted),
            "has_config": config is not None,
            "is_active": config.is_active if config else False,
        }
    if name == "config_update_profile":
        changes = {}
        for field_name in ("name", "description", "site_type"):
            if field_name in arguments:
                changes[field_name] = arguments[field_name]
        if not changes:
            raise HTTPException(status_code=422, detail="No fields to update")
        if "site_type" in changes and changes["site_type"] not in {
            "none",
            "shopify",
            "vendure",
            "independent",
        }:
            raise HTTPException(status_code=422, detail="Invalid site type")
        for key, value in changes.items():
            setattr(context.workspace, key, str(value).strip())
        record_audit(
            session,
            workspace_id=context.workspace.id,
            actor_user_id=context.user.id,
            action="agent.workspace_profile_updated",
            entity_type="workspace",
            entity_id=context.workspace.id,
            payload={"fields": sorted(changes)},
        )
        await session.commit()
        return {"updated": sorted(changes)}
    if name == "config_update_shopify":
        if config is None:
            config = ShopifyConfig(id=new_id(), workspace_id=context.workspace.id)
            session.add(config)
        fields = []
        if "store_url" in arguments:
            config.store_url = _normalize_store_url(str(arguments["store_url"]))
            fields.append("store_url")
        if "api_key" in arguments:
            config.api_key_encrypted = encrypt_secret(str(arguments["api_key"]), settings)
            fields.append("api_key")
        if "api_secret_key" in arguments:
            config.api_secret_encrypted = encrypt_secret(str(arguments["api_secret_key"]), settings)
            fields.append("api_secret_key")
        if not fields:
            raise HTTPException(status_code=422, detail="No fields to update")
        config.is_active = False
        record_audit(
            session,
            workspace_id=context.workspace.id,
            actor_user_id=context.user.id,
            action="agent.shopify_config_updated",
            entity_type="shopify_config",
            entity_id=config.id,
            payload={"fields": sorted(fields), "is_active": False},
        )
        clear_shopify_caches(context.workspace.id)
        await session.commit()
        return {"updated": sorted(fields), "is_active": False}
    if config is None:
        raise HTTPException(status_code=409, detail="Shopify configuration is missing")
    if name == "config_toggle_shopify":
        enabled = arguments.get("enabled") is True
        if enabled and not (
            config.store_url and config.api_key_encrypted and config.api_secret_encrypted
        ):
            raise HTTPException(status_code=409, detail="Shopify configuration is incomplete")
        config.is_active = enabled
        clear_shopify_caches(context.workspace.id)
        await session.commit()
        return {"is_active": enabled}
    if arguments.get("confirm") is not True:
        raise HTTPException(status_code=422, detail="confirm=true is required")
    if config.is_active:
        raise HTTPException(status_code=409, detail="Disable Shopify before deleting it")
    await session.delete(config)
    clear_shopify_caches(context.workspace.id)
    await session.commit()
    return {"deleted": True}


async def _knowledge_search(
    arguments: dict,
    context: WorkspaceContext,
    session: AsyncSession,
) -> dict:
    query = " ".join(str(arguments.get("query") or "").split()).strip()
    if not query:
        raise HTTPException(status_code=422, detail="Knowledge query is required")
    limit = min(50, max(1, int(arguments.get("page_size") or 10)))
    term = f"%{query}%"
    products = (
        await session.scalars(
            select(Product)
            .where(
                Product.workspace_id == context.workspace.id,
                Product.is_deleted.is_(False),
                or_(Product.name.ilike(term), Product.description.ilike(term)),
            )
            .limit(limit)
        )
    ).all()
    results = [
        {"id": item.id, "title": item.name, "content": item.description, "type": "product"}
        for item in products
    ]
    profile_text = " ".join(
        [context.workspace.name, context.workspace.description, context.workspace.prompt]
    )
    if query.casefold() in profile_text.casefold() and len(results) < limit:
        results.insert(
            0,
            {
                "id": context.workspace.id,
                "title": context.workspace.name,
                "content": context.workspace.description,
                "type": "workspace_profile",
            },
        )
    return {"total": len(results), "page_size": limit, "results": results[:limit]}


async def _onboarding_tool(
    name: str,
    arguments: dict,
    context: WorkspaceContext,
    session: AsyncSession,
) -> dict:
    if name == "onboarding_get_status":
        return normalize_state(context.workspace.onboarding_state)
    if name == "onboarding_save_step_draft":
        return await save_draft(
            str(arguments.get("step") or ""),
            DraftRequest(answers=arguments.get("answers") or {}),
            context,
            session,
        )
    if name == "onboarding_apply_card":
        return await apply_card(
            str(arguments.get("step") or ""),
            ApplyRequest(
                card_id=str(arguments.get("card_id") or ""),
                shopify_store_url=arguments.get("shopify_store_url"),
                shopify_api_key=arguments.get("shopify_api_key"),
                shopify_api_secret_key=arguments.get("shopify_api_secret_key"),
            ),
            context,
            session,
        )
    if name == "onboarding_cancel_card":
        return await cancel_card(
            str(arguments.get("step") or ""),
            str(arguments.get("card_id") or ""),
            context,
            session,
        )
    if name == "onboarding_confirm_step":
        return await confirm_step(
            str(arguments.get("step") or ""),
            ConfirmRequest(confirmed=arguments.get("confirmed") is True),
            context,
            session,
        )
    if name == "onboarding_pause":
        return await pause_onboarding(context, session)
    if name == "onboarding_continue":
        return await continue_onboarding(context, session)
    if name == "onboarding_restart":
        return await restart_onboarding(
            ConfirmRequest(confirmed=arguments.get("confirmed") is True), context, session
        )
    if name == "onboarding_finish":
        return await finish_onboarding(
            ConfirmRequest(confirmed=arguments.get("confirmed") is True), context, session
        )
    return await back_onboarding(context, session)


async def execute_tool(
    *,
    name: str,
    arguments: dict,
    context: WorkspaceContext,
    session: AsyncSession,
    settings: Settings,
    execution_key: str,
) -> dict:
    if name.startswith("lead_"):
        return await _lead_tool(name, arguments, context, session)
    if name in {
        "product_list_products",
        "product_get_detail",
        "product_list_skus",
        "product_download_template",
        "product_check_stock",
    }:
        return await _product_read_tool(name, arguments, context, session)
    if name.startswith("product_"):
        return await _product_write_tool(name, arguments, context, session, execution_key)
    if name.startswith("config_"):
        return await _config_tool(name, arguments, context, session, settings)
    if name == "knowledge_search":
        return await _knowledge_search(arguments, context, session)
    if name.startswith("onboarding_"):
        return await _onboarding_tool(name, arguments, context, session)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent tool not found")
