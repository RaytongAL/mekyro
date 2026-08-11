from dataclasses import dataclass


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    writes: bool = False


TOOLS = {
    item.name: item
    for item in (
        ToolSpec("lead_list_leads", "查询工作区线索列表"),
        ToolSpec("lead_get_detail", "查询线索详情"),
        ToolSpec("lead_get_contact_logs", "查询线索联系记录"),
        ToolSpec("lead_count_by_stage", "统计各阶段线索"),
        ToolSpec("product_list_products", "查询商品列表"),
        ToolSpec("product_get_detail", "查询商品详情"),
        ToolSpec("product_list_skus", "查询 SKU 列表"),
        ToolSpec("product_download_template", "获取商品导入模板"),
        ToolSpec("product_check_stock", "查询商品或 SKU 库存"),
        ToolSpec("product_create", "创建商品和 SKU", True),
        ToolSpec("product_update", "更新商品", True),
        ToolSpec("product_delete", "删除商品", True),
        ToolSpec("product_create_sku", "创建 SKU", True),
        ToolSpec("product_update_sku", "更新 SKU", True),
        ToolSpec("product_delete_sku", "删除 SKU", True),
        ToolSpec("product_adjust_stock", "调整 SKU 库存", True),
        ToolSpec("product_import", "确认已预览的商品导入", True),
        ToolSpec("config_get_profile", "查询工作区和 Shopify 公开配置"),
        ToolSpec("config_update_profile", "更新工作区资料", True),
        ToolSpec("config_update_shopify", "更新 Shopify 密钥配置", True),
        ToolSpec("config_toggle_shopify", "启用或停用 Shopify 同步", True),
        ToolSpec("config_delete_shopify", "删除 Shopify 配置", True),
        ToolSpec("knowledge_search", "查询工作区内可见知识"),
        ToolSpec("onboarding_get_status", "查询入驻进度"),
        ToolSpec("onboarding_save_step_draft", "保存入驻草稿", True),
        ToolSpec("onboarding_apply_card", "应用入驻卡片", True),
        ToolSpec("onboarding_cancel_card", "取消入驻卡片", True),
        ToolSpec("onboarding_confirm_step", "确认入驻步骤", True),
        ToolSpec("onboarding_pause", "暂停入驻", True),
        ToolSpec("onboarding_continue", "继续入驻", True),
        ToolSpec("onboarding_restart", "重新开始入驻", True),
        ToolSpec("onboarding_finish", "完成入驻引导", True),
        ToolSpec("onboarding_back_step", "返回上一入驻步骤", True),
    )
}


def get_tool(name: str) -> ToolSpec | None:
    return TOOLS.get(name)


def _object_schema(
    properties: dict[str, dict] | None = None,
    *,
    required: tuple[str, ...] = (),
) -> dict:
    schema: dict = {
        "type": "object",
        "properties": properties or {},
        "additionalProperties": False,
    }
    if required:
        schema["required"] = list(required)
    return schema


_STRING = {"type": "string"}
_INTEGER = {"type": "integer"}
_BOOLEAN = {"type": "boolean"}
_OBJECT = {"type": "object"}
_ARRAY = {"type": "array", "items": {"type": "object"}}
_COUNTRY_CODE = {
    "type": "string",
    "description": "ISO 3166-1 alpha-2 country code, for example JP, CN, or US",
    "minLength": 2,
    "maxLength": 2,
}

TOOL_PARAMETERS = {
    "lead_list_leads": _object_schema(
        {
            "country": _COUNTRY_CODE,
            "stage": _STRING,
            "page": _INTEGER,
            "page_size": _INTEGER,
        }
    ),
    "lead_get_detail": _object_schema({"lead_id": _STRING}, required=("lead_id",)),
    "lead_get_contact_logs": _object_schema({"lead_id": _STRING}, required=("lead_id",)),
    "product_list_products": _object_schema(
        {
            "search": _STRING,
            "category_id": _STRING,
            "brand_id": _STRING,
            "brand_name": _STRING,
            "status": _STRING,
            "stock": _STRING,
            "page": _INTEGER,
            "page_size": _INTEGER,
        }
    ),
    "product_get_detail": _object_schema({"product_id": _STRING}, required=("product_id",)),
    "product_list_skus": _object_schema(
        {
            "search": _STRING,
            "category_id": _STRING,
            "brand_id": _STRING,
            "brand_name": _STRING,
            "product_id": _STRING,
            "status": _STRING,
            "stock": _STRING,
            "page": _INTEGER,
            "page_size": _INTEGER,
        }
    ),
    "product_check_stock": _object_schema({"product_id": _STRING, "sku_id": _STRING}),
    "product_create": _object_schema(
        {
            "name": _STRING,
            "category_id": _STRING,
            "description": _STRING,
            "status": _STRING,
            "spec_template": _ARRAY,
            "skus": _ARRAY,
        },
        required=("name",),
    ),
    "product_update": _object_schema(
        {
            "product_id": _STRING,
            "name": _STRING,
            "category_id": _STRING,
            "description": _STRING,
            "status": _STRING,
            "spec_template": _ARRAY,
        },
        required=("product_id",),
    ),
    "product_delete": _object_schema({"product_id": _STRING}, required=("product_id",)),
    "product_create_sku": _object_schema(
        {
            "product_id": _STRING,
            "sku_code": _STRING,
            "specs": _OBJECT,
            "moq": _INTEGER,
            "currency": _STRING,
            "stock_quantity": _INTEGER,
            "status": _STRING,
            "price_tiers": _ARRAY,
        },
        required=("product_id", "sku_code"),
    ),
    "product_update_sku": _object_schema(
        {
            "sku_id": _STRING,
            "sku_code": _STRING,
            "specs": _OBJECT,
            "moq": _INTEGER,
            "currency": _STRING,
            "stock_quantity": _INTEGER,
            "status": _STRING,
            "product_name": _STRING,
            "product_category_id": _STRING,
        },
        required=("sku_id",),
    ),
    "product_delete_sku": _object_schema({"sku_id": _STRING}, required=("sku_id",)),
    "product_adjust_stock": _object_schema(
        {
            "sku_id": _STRING,
            "type": _STRING,
            "quantity": _INTEGER,
            "reason": _STRING,
            "reference_id": _STRING,
        },
        required=("sku_id", "type", "quantity"),
    ),
    "product_import": _object_schema({"file_url": _STRING, "rows": _ARRAY}),
    "config_update_profile": _object_schema(
        {"name": _STRING, "description": _STRING, "site_type": _STRING}
    ),
    "config_update_shopify": _object_schema(
        {"store_url": _STRING, "api_key": _STRING, "api_secret_key": _STRING}
    ),
    "config_toggle_shopify": _object_schema(
        {"enabled": _BOOLEAN}, required=("enabled",)
    ),
    "config_delete_shopify": _object_schema({"confirm": _BOOLEAN}, required=("confirm",)),
    "knowledge_search": _object_schema(
        {"query": _STRING, "page_size": _INTEGER}, required=("query",)
    ),
    "onboarding_save_step_draft": _object_schema(
        {"step": _STRING, "answers": _OBJECT}, required=("step", "answers")
    ),
    "onboarding_apply_card": _object_schema(
        {
            "step": _STRING,
            "card_id": _STRING,
            "shopify_store_url": _STRING,
            "shopify_api_key": _STRING,
            "shopify_api_secret_key": _STRING,
        },
        required=("step", "card_id"),
    ),
    "onboarding_cancel_card": _object_schema(
        {"step": _STRING, "card_id": _STRING}, required=("step", "card_id")
    ),
    "onboarding_confirm_step": _object_schema(
        {"step": _STRING, "confirmed": _BOOLEAN}, required=("step", "confirmed")
    ),
    "onboarding_restart": _object_schema(
        {"confirmed": _BOOLEAN}, required=("confirmed",)
    ),
    "onboarding_finish": _object_schema(
        {"confirmed": _BOOLEAN}, required=("confirmed",)
    ),
}


def openai_tools() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": spec.name,
                "description": spec.description,
                "parameters": TOOL_PARAMETERS.get(spec.name, _object_schema()),
            },
        }
        for spec in TOOLS.values()
    ]
