# Mekyro 外部服务 API 文档

> 适用版本：FastAPI 后端  
> 校对日期：2026-08-19  
> 适用场景：外部 CRM、线索采集服务、商品系统、库存系统向 Mekyro 查询或同步数据

## 1. 接入说明

### 1.1 基础地址

| 环境 | Base URL |
|---|---|
| 生产环境 | `https://www.mekyro.com/api/v1` |
| 本地环境 | `http://127.0.0.1:8200/api/v1` |
| 本地 OpenAPI JSON | `http://127.0.0.1:8200/openapi.json` |
| 本地 Swagger UI | `http://127.0.0.1:8200/docs` |

生产站点是否公开 Swagger/OpenAPI 取决于网关配置；外部集成应以本文档和正式提供的生产 Base URL 为准。

本文后续路径均省略 Base URL。例如：

```http
GET /external/leads
```

生产环境完整地址为：

```text
https://www.mekyro.com/api/v1/external/leads
```

### 1.2 API Key 鉴权

运营管理员在“API 密钥管理”中创建密钥，并为密钥绑定工作区和权限。创建成功时只返回一次完整密钥，调用方应安全保存。

所有外部接口都必须携带：

```http
X-Api-Key: mek_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

API Key 的工作区是服务端唯一的租户范围。请求体中不接收 `workspace_id`，外部服务不能借助参数跨工作区访问数据。

### 1.3 通用请求头

```http
X-Api-Key: <your_api_key>
Content-Type: application/json
```

库存写接口建议额外传递调用方生成的幂等键：

```http
Idempotency-Key: inventory-order-20260819-0001
```

### 1.4 响应格式

FastAPI 接口直接返回资源对象或列表，不再使用旧版 Django 的 `code/message/data` 包装。

成功示例：

```json
{
  "id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
  "merchant_name": "Example Buyer"
}
```

分页示例：

```json
{
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": []
}
```

删除成功返回 `204 No Content`，响应体为空。

业务错误示例：

```json
{
  "detail": "API key permission required: lead:create"
}
```

参数校验失败返回 `422`，`detail` 为 FastAPI 校验错误数组。

### 1.5 常见状态码

| 状态码 | 含义 |
|---|---|
| `200` | 查询或更新成功 |
| `201` | 创建成功 |
| `204` | 删除成功，无响应体 |
| `401` | API Key 缺失、无效、停用，或所属用户/工作区不可用 |
| `403` | API Key 缺少当前接口要求的权限 |
| `404` | 资源不存在，或资源不属于 API Key 绑定的工作区 |
| `409` | 唯一约束冲突、非法状态流转、库存不足等业务冲突 |
| `422` | 请求字段或查询参数校验失败 |

## 2. 权限编码

| 权限 | 控制范围 |
|---|---|
| `workspace:read` | 读取工作区提示词和每日线索量 |
| `lead:read` | 查询线索 |
| `lead:create` | 创建、批量创建线索 |
| `lead:update` | 更新线索 |
| `lead:delete` | 删除线索 |
| `lead_contact_log:read` | 查询联系记录 |
| `lead_contact_log:create` | 创建、批量创建联系记录 |
| `lead_contact_log:update` | 更新联系记录 |
| `lead_contact_log:delete` | 删除联系记录 |
| `product:read` | 查询分类、商品、SKU |
| `product:create` | 创建分类、商品、SKU |
| `product:update` | 更新分类、商品、SKU、阶梯价 |
| `product:delete` | 删除分类、商品、SKU |
| `product_inventory:read` | 查询库存流水 |
| `product_inventory:create` | 单条或批量执行出入库调整 |

建议按最小权限原则创建密钥。例如，仅同步线索的服务通常只需要：

```json
[
  "lead:read",
  "lead:create",
  "lead:update"
]
```

## 3. 路由总览

### 3.1 工作区

| 方法 | 路径 | 权限 |
|---|---|---|
| `GET` | `/external/workspace/prompt` | `workspace:read` |

### 3.2 线索

| 方法 | 路径 | 权限 |
|---|---|---|
| `GET` | `/external/leads` | `lead:read` |
| `POST` | `/external/leads` | `lead:create` |
| `POST` | `/external/leads/batch` | `lead:create` |
| `GET` | `/external/leads/{lead_id}` | `lead:read` |
| `PATCH` | `/external/leads/{lead_id}` | `lead:update` |
| `DELETE` | `/external/leads/{lead_id}` | `lead:delete` |

### 3.3 联系记录

| 方法 | 路径 | 权限 |
|---|---|---|
| `GET` | `/external/leads/{lead_id}/contact-logs` | `lead_contact_log:read` |
| `POST` | `/external/leads/{lead_id}/contact-logs` | `lead_contact_log:create` |
| `POST` | `/external/leads/{lead_id}/contact-logs/batch` | `lead_contact_log:create` |
| `GET` | `/external/contact-logs/{activity_id}` | `lead_contact_log:read` |
| `PATCH` | `/external/contact-logs/{activity_id}` | `lead_contact_log:update` |
| `DELETE` | `/external/contact-logs/{activity_id}` | `lead_contact_log:delete` |

### 3.4 分类、商品和 SKU

| 方法 | 路径 | 权限 |
|---|---|---|
| `GET` | `/external/categories` | `product:read` |
| `POST` | `/external/categories` | `product:create` |
| `GET` | `/external/categories/{category_id}` | `product:read` |
| `PATCH` | `/external/categories/{category_id}` | `product:update` |
| `DELETE` | `/external/categories/{category_id}` | `product:delete` |
| `GET` | `/external/products` | `product:read` |
| `POST` | `/external/products` | `product:create` |
| `GET` | `/external/products/{product_id}` | `product:read` |
| `PATCH` | `/external/products/{product_id}` | `product:update` |
| `DELETE` | `/external/products/{product_id}` | `product:delete` |
| `POST` | `/external/products/{product_id}/variants` | `product:create` |
| `GET` | `/external/variants` | `product:read` |
| `GET` | `/external/variants/{variant_id}` | `product:read` |
| `PATCH` | `/external/variants/{variant_id}` | `product:update` |
| `DELETE` | `/external/variants/{variant_id}` | `product:delete` |
| `PUT` | `/external/variants/{variant_id}/price-tiers` | `product:update` |
| `PATCH` | `/external/batch/variants` | `product:update` |
| `PUT` | `/external/batch/price-tiers` | `product:update` |

### 3.5 库存

| 方法 | 路径 | 权限 |
|---|---|---|
| `GET` | `/external/inventory-movements` | `product_inventory:read` |
| `POST` | `/external/inventory-adjustments` | `product_inventory:create` |
| `POST` | `/external/batch/inventory-adjustments` | `product_inventory:create` |

## 4. 工作区接口

### 4.1 查询工作区提示词

```http
GET /external/workspace/prompt
```

响应：

```json
{
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "workspace_name": "上海芒可忆",
  "prompt": "目标客户和获客要求",
  "daily_lead_limit": 50
}
```

## 5. 线索接口

### 5.1 线索字段

创建线索请求：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `source` | string | 否 | 来源类型，默认 `manual` |
| `platform_name` | string | 否 | 具体平台名称，例如 `WhatsApp`、`LinkedIn` |
| `external_ref` | string | 否 | 外部系统唯一标识；不传时由系统生成 |
| `merchant_name` | string | 是 | 商家或客户名称，最长 200 |
| `company_name` | string | 是 | 公司名称，最长 200 |
| `contact_person` | string | 否 | 联系人 |
| `country` | string | 是 | 两位国家代码，例如 `CN`、`US` |
| `city` | string | 否 | 城市 |
| `zip_code` | string | 否 | 邮编 |
| `description` | string | 否 | 描述，最长 10000 |
| `email` | string | 否 | 邮箱 |
| `phone` | string | 否 | 电话 |
| `country_code` | string | 否 | 国际区号，例如 `+86` |
| `whatsapp` | string | 否 | WhatsApp 联系方式 |
| `recommendation_score` | integer | 否 | 推荐分，范围 0～100 |
| `recommendation_reason` | string | 否 | 推荐理由 |

`source` 枚举：

```text
manual, website, amazon, trade_show, other
```

注意：旧版文档中的 `platform` 不是当前数据字段。当前模型使用：

- `source`：来源类型，使用固定枚举；
- `platform_name`：具体平台名称，可填写 WhatsApp、LinkedIn 等。

同一工作区内，`source + external_ref` 必须唯一。

### 5.2 查询线索列表

```http
GET /external/leads?search=Buyer&stage=new&country=US&source=manual&limit=20&offset=0
```

查询参数：

| 参数 | 说明 |
|---|---|
| `search` | 搜索商家名称、公司名称、联系人和邮箱 |
| `stage` | 按跟进阶段筛选 |
| `country` | 两位国家代码，不区分输入大小写 |
| `source` | 按来源类型筛选 |
| `platform` | 兼容旧调用方的查询参数，值必须是 `source` 枚举；建议新接入使用 `source` |
| `limit` | 返回数量，默认 20，最大 100 |
| `offset` | 偏移量，默认 0 |
| `page`、`page_size` | 兼容旧分页方式；传入后换算为 limit/offset |

响应：

```json
{
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
      "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
      "workspace_name": "上海芒可忆",
      "source": "manual",
      "platform_name": "LinkedIn",
      "external_ref": "LINKEDIN-10001",
      "merchant_name": "Example Buyer",
      "company_name": "Example Buyer Ltd",
      "contact_person": "Alex",
      "country": "US",
      "city": "New York",
      "zip_code": "10001",
      "description": "Interested in recurring purchases",
      "email": "alex@example.com",
      "phone": "",
      "country_code": "+1",
      "whatsapp": "",
      "stage": "new",
      "recommendation_score": 80,
      "recommendation_reason": "需求匹配",
      "created_at": "2026-08-19T10:00:00Z",
      "updated_at": "2026-08-19T10:00:00Z",
      "latest_contact_at": null
    }
  ]
}
```

### 5.3 创建线索

```http
POST /external/leads
```

```json
{
  "source": "other",
  "platform_name": "LinkedIn",
  "external_ref": "LINKEDIN-10001",
  "merchant_name": "Example Buyer",
  "company_name": "Example Buyer Ltd",
  "contact_person": "Alex",
  "country": "US",
  "email": "alex@example.com",
  "recommendation_score": 80,
  "recommendation_reason": "需求匹配"
}
```

成功返回 `201` 和线索对象。

### 5.4 批量创建线索

```http
POST /external/leads/batch
```

```json
{
  "items": [
    {
      "source": "website",
      "external_ref": "WEB-10001",
      "merchant_name": "Buyer One",
      "company_name": "Buyer One Ltd",
      "country": "GB"
    },
    {
      "source": "other",
      "platform_name": "WhatsApp",
      "external_ref": "WA-10002",
      "merchant_name": "Buyer Two",
      "company_name": "Buyer Two GmbH",
      "country": "DE"
    }
  ]
}
```

`items` 最少 1 条、最多 500 条。成功返回 `201` 和线索对象数组。批次中发生唯一约束冲突时整批回滚。

### 5.5 查询、更新和删除线索

```http
GET /external/leads/{lead_id}
PATCH /external/leads/{lead_id}
DELETE /external/leads/{lead_id}
```

更新示例：

```json
{
  "stage": "contacting",
  "description": "External CRM started outreach"
}
```

跟进阶段枚举：

```text
new, contacting, replied, qualified, quoting, ordered, lost
```

阶段只能按业务状态机向后流转。例如 `new -> contacting` 合法，`ordered -> new` 会返回 `409`。

删除线索为硬删除，并删除联系记录；已关联订单和报价保留，但会解除线索关联。

## 6. 联系记录接口

### 6.1 创建字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `activity_type` | string | 否 | 联系记录类型 |
| `direction` | string | 否 | `inbound` 或 `outbound` |
| `channel` | string | 是 | 联系渠道 |
| `subject` | string | 否 | 主题 |
| `sender` | string | 否 | 发送方邮箱 |
| `recipient` | string | 否 | 接收方邮箱 |
| `content` | string | 是 | 联系内容，最长 10000 |

`activity_type`：

```text
ai_outbound, human_outbound, customer_inbound
```

`channel`：

```text
email, whatsapp, phone, meeting, other
```

若只传 `activity_type`，系统会自动推导 `direction`。`customer_inbound` 对应 `inbound`，其他类型对应 `outbound`。

### 6.2 查询联系记录

```http
GET /external/leads/{lead_id}/contact-logs?type=customer_inbound&channel=email&limit=50&offset=0
GET /external/contact-logs/{activity_id}
```

列表支持 `type`、`channel`、`search`、`limit/offset` 和兼容参数 `page/page_size`。

### 6.3 创建和批量创建

```http
POST /external/leads/{lead_id}/contact-logs
```

```json
{
  "activity_type": "customer_inbound",
  "channel": "whatsapp",
  "content": "Customer requested pricing and MOQ."
}
```

批量创建：

```http
POST /external/leads/{lead_id}/contact-logs/batch
```

```json
{
  "items": [
    {
      "activity_type": "human_outbound",
      "channel": "email",
      "subject": "Product introduction",
      "content": "Introduced the current catalog."
    },
    {
      "activity_type": "customer_inbound",
      "channel": "email",
      "content": "Customer requested a quote."
    }
  ]
}
```

### 6.4 更新和删除

```http
PATCH /external/contact-logs/{activity_id}
DELETE /external/contact-logs/{activity_id}
```

更新可传 `activity_type`、`channel`、`subject`、`sender`、`recipient`、`content`。

## 7. 分类接口

分类是树形结构。根分类的 `parent_id` 为 `null`，子分类的 `parent_id` 为父分类 UUID。

### 7.1 查询分类

```http
GET /external/categories
GET /external/categories/{category_id}
```

分类列表直接返回数组，不使用分页包装。

### 7.2 创建分类

```http
POST /external/categories
```

```json
{
  "name": "Mobile Phones",
  "parent_id": null,
  "sort_order": 0
}
```

### 7.3 更新和删除分类

```http
PATCH /external/categories/{category_id}
DELETE /external/categories/{category_id}
```

删除分类会按现有分类树规则处理其子分类。分类仍被商品引用时，以接口实际返回的冲突信息为准。

## 8. 商品接口

### 8.1 查询商品列表

```http
GET /external/products?search=Phone&category_id={uuid}&status=active&limit=20&offset=0
```

支持参数：

| 参数 | 说明 |
|---|---|
| `search` | 搜索商品名称和描述 |
| `category_id` | 分类及其后代分类 |
| `brand_id` | 品牌分类 UUID |
| `brand_name` | 品牌分类名称 |
| `status` | `active` 或 `inactive` |
| `limit`、`offset` | 默认 20/0，limit 最大 100 |
| `page`、`page_size` | 兼容旧分页参数 |
| `include_skus` | 兼容旧参数；当前商品响应始终包含未删除 SKU |

响应格式：

```json
{
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": []
}
```

### 8.2 创建商品及 SKU

```http
POST /external/products
```

```json
{
  "category_id": "1e0748eb-e76d-41df-9874-b8b5b8204519",
  "name": "Refurbished Smartphone",
  "description": "Grade A refurbished device",
  "specification_template": [
    {"name": "Storage", "options": ["128GB", "256GB"]}
  ],
  "status": "active",
  "images": ["https://cdn.example.com/product.jpg"],
  "detail_image": "https://cdn.example.com/detail.jpg",
  "variants": [
    {
      "sku_code": "PHONE-A-128",
      "specifications": {"Grade": "A", "Storage": "128GB"},
      "minimum_order_quantity": 1,
      "currency": "USD",
      "stock_quantity": 10,
      "status": "active",
      "price_tiers": [
        {"minimum_quantity": 1, "unit_price": "299.00"},
        {"minimum_quantity": 10, "unit_price": "279.00"}
      ],
      "image": "https://cdn.example.com/sku.jpg"
    }
  ]
}
```

约束：

- 一个商品最多传 5 张 `images`；
- 商品内 SKU 编码不能重复；
- 同一工作区内 `sku_code` 唯一；
- 币种必须是三位大写代码，例如 `USD`；
- 阶梯价数量必须唯一且升序；
- URL 必须是 `http(s)://...` 或 `/media/...`。

### 8.3 查询、更新和删除商品

```http
GET /external/products/{product_id}
PATCH /external/products/{product_id}
DELETE /external/products/{product_id}
```

商品更新支持：`category_id`、`name`、`description`、`specification_template`、`status`。

外部接口删除商品执行软删除，同时软删除其 SKU；返回 `204`。外部 API 当前未开放恢复和永久删除接口。

## 9. SKU 与阶梯价接口

### 9.1 创建 SKU

```http
POST /external/products/{product_id}/variants
```

请求字段与商品创建中的 `variants[]` 单项相同。

### 9.2 查询 SKU

```http
GET /external/variants?search=PHONE&status=active&stock=in_stock&limit=50&offset=0
GET /external/variants/{variant_id}
```

列表支持：

- `search`
- `status=active|inactive`
- `stock=in_stock|out_of_stock`
- `category_id`
- `brand_id`
- `brand_name`
- `product_id`
- `spec_key`、`spec_value`
- `ordering=created_at|-created_at|sku_code|-sku_code|stock_quantity|-stock_quantity`
- `limit/offset` 或兼容参数 `page/page_size`

多个规格筛选使用逗号分隔，键和值数量必须一致：

```http
GET /external/variants?spec_key=Grade,Storage&spec_value=A,128GB
```

注意：SKU 列表当前直接返回数组，不返回 `total/limit/offset` 包装。

### 9.3 更新和删除 SKU

```http
PATCH /external/variants/{variant_id}
DELETE /external/variants/{variant_id}
```

更新支持：`sku_code`、`specifications`、`minimum_order_quantity`、`currency`、`stock_quantity`、`status`、`price`、`product_name`、`product_category_id`。

删除 SKU 执行软删除，返回 `204`。

### 9.4 覆盖阶梯价

```http
PUT /external/variants/{variant_id}/price-tiers
```

请求体是数组，覆盖该 SKU 的全部阶梯价：

```json
[
  {"minimum_quantity": 1, "unit_price": "299.00"},
  {"minimum_quantity": 10, "unit_price": "279.00"}
]
```

### 9.5 批量更新 SKU

```http
PATCH /external/batch/variants
```

请求体是数组：

```json
[
  {
    "id": "3ecba047-6486-4c60-8566-a40e15d313c5",
    "minimum_order_quantity": 5
  },
  {
    "id": "255c99d9-2fcf-4a33-b3aa-879abbb80aa9",
    "status": "inactive"
  }
]
```

最多 500 条。

### 9.6 批量覆盖阶梯价

```http
PUT /external/batch/price-tiers
```

```json
[
  {
    "variant_id": "3ecba047-6486-4c60-8566-a40e15d313c5",
    "price_tiers": [
      {"minimum_quantity": 5, "unit_price": "269.00"}
    ]
  }
]
```

最多 500 个 SKU。

## 10. 库存接口

### 10.1 查询库存流水

```http
GET /external/inventory-movements?variant_id={uuid}&type=inbound&limit=50&offset=0
```

支持参数：

- `variant_id`
- `type=inbound|outbound|adjustment`
- `search`
- `ordering=id|-id|created_at|-created_at|quantity_delta|-quantity_delta|balance_after|-balance_after|sku_code|-sku_code|product_name|-product_name`
- `limit/offset` 或兼容参数 `page/page_size`

响应：

```json
{
  "total": 1,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "8b36838d-e132-4233-8fb5-3d5816251f98",
      "variant_id": "3ecba047-6486-4c60-8566-a40e15d313c5",
      "sku_code": "PHONE-A-128",
      "product_name": "Refurbished Smartphone",
      "movement_type": "inbound",
      "quantity_delta": 10,
      "balance_after": 20,
      "reason": "Purchase receipt",
      "reference": "PO-20260819-001",
      "created_by": "api-key-name",
      "created_at": "2026-08-19T10:00:00Z"
    }
  ]
}
```

### 10.2 单条出入库

```http
POST /external/inventory-adjustments
Idempotency-Key: inventory-order-20260819-0001
```

```json
{
  "variant_id": "3ecba047-6486-4c60-8566-a40e15d313c5",
  "movement_type": "inbound",
  "quantity_delta": 10,
  "reason": "Purchase receipt",
  "reference": "PO-20260819-001"
}
```

方向规则：

- `inbound` 的 `quantity_delta` 必须大于 0；
- `outbound` 的 `quantity_delta` 必须小于 0；
- `adjustment` 可正可负；
- 调整后库存不能小于 0。

### 10.3 批量出入库

```http
POST /external/batch/inventory-adjustments
Idempotency-Key: inventory-batch-20260819-0001
```

请求体是数组，不是 `{ "items": [...] }`：

```json
[
  {
    "variant_id": "3ecba047-6486-4c60-8566-a40e15d313c5",
    "movement_type": "inbound",
    "quantity_delta": 10,
    "reason": "Purchase receipt"
  },
  {
    "variant_id": "255c99d9-2fcf-4a33-b3aa-879abbb80aa9",
    "movement_type": "outbound",
    "quantity_delta": -2,
    "reason": "Order allocation"
  }
]
```

最多 500 条，成功返回：

```json
{
  "items": [
    {
      "movement_id": "8b36838d-e132-4233-8fb5-3d5816251f98",
      "variant_id": "3ecba047-6486-4c60-8566-a40e15d313c5",
      "sku_code": "PHONE-A-128",
      "movement_type": "inbound",
      "quantity_delta": 10,
      "balance_after": 20,
      "reason": "Purchase receipt",
      "reference": "",
      "created_by": "api-key-name"
    }
  ]
}
```

## 11. cURL 快速示例

### 11.1 创建线索

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/leads" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "other",
    "platform_name": "LinkedIn",
    "external_ref": "LINKEDIN-10001",
    "merchant_name": "Example Buyer",
    "company_name": "Example Buyer Ltd",
    "country": "US"
  }'
```

### 11.2 创建商品

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/products" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Example Product",
    "variants": [
      {
        "sku_code": "EXAMPLE-SKU-001",
        "stock_quantity": 0,
        "price_tiers": [
          {"minimum_quantity": 1, "unit_price": "99.00"}
        ]
      }
    ]
  }'
```

### 11.3 执行入库

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/inventory-adjustments" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Idempotency-Key: receipt-20260819-001" \
  -H "Content-Type: application/json" \
  -d '{
    "variant_id": "3ecba047-6486-4c60-8566-a40e15d313c5",
    "movement_type": "inbound",
    "quantity_delta": 10,
    "reason": "Purchase receipt",
    "reference": "PO-20260819-001"
  }'
```

## 12. 从旧版 Django 接口迁移

旧文档中的接口路径和响应格式不能直接用于当前 FastAPI 后端。

| 旧接口示例 | 当前接口 |
|---|---|
| `/api/external/leads/` | `/api/v1/external/leads` |
| `/api/external/leads/create/` | `POST /api/v1/external/leads` |
| `/api/external/leads/batch-create/` | `POST /api/v1/external/leads/batch` |
| `/api/external/leads/{id}/update/` | `PATCH /api/v1/external/leads/{lead_id}` |
| `/api/external/leads/{id}/delete/` | `DELETE /api/v1/external/leads/{lead_id}` |
| `/api/external/leads/{id}/contact-logs/create/` | `POST /api/v1/external/leads/{lead_id}/contact-logs` |
| `/api/external/products/{id}/skus/` | `/api/v1/external/products/{product_id}/variants` |
| `/api/external/skus/{id}/inventory-logs/` | `/api/v1/external/inventory-movements?variant_id={variant_id}` |

关键数据差异：

1. `id` 和关联 ID 均为字符串 UUID，不再是整数自增 ID。
2. 线索的 `platform` 字段改为 `source` 和 `platform_name`。
3. `merchant_id` 改为 `external_ref`。
4. `ws_lead_id` 改为 `lead_id`。
5. `type` 在联系记录响应中改为 `activity_type`。
6. `email_title`、`email_sender` 分别改为 `subject`、`sender`，并新增 `recipient`。
7. 商品明细中的 `skus` 改为 `variants`。
8. 库存字段使用 `movement_type`、`quantity_delta`、`reference`。
9. 成功响应不再包装为 `code/message/data`。
10. 删除成功统一返回 `204`，没有 JSON 响应体。

## 13. 接入建议

1. 为每个外部系统单独创建 API Key，不要在多个系统间共用。
2. 只授予实际需要的权限，并在停用集成时立即停用密钥。
3. 线索同步应稳定提供 `source + external_ref`，用于防止重复写入。
4. 库存写操作始终提供稳定的 `Idempotency-Key`，重试时复用同一个值。
5. 调用方应正确处理 `401`、`403`、`409` 和 `422`，不要对所有失败无限重试。
6. 外部服务上线前应使用专用测试工作区完成联调，避免污染正式工作区数据。
