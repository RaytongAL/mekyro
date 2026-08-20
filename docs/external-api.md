# API 接口文档

> 适用版本：Mekyro FastAPI 后端
> 更新时间：2026-08-20
> 使用对象：线索采集服务、CRM、商品系统、库存系统等外部调用方

## 目录

- [前置准备](#前置准备)
- [一、外部接口：线索 CRUD](#一外部接口线索-crud)
  - [1.1 线索列表查询](#11-线索列表查询)
  - [1.2 线索详情查询](#12-线索详情查询)
  - [1.3 创建线索](#13-创建线索)
  - [1.4 批量创建线索](#14-批量创建线索)
  - [1.5 更新线索](#15-更新线索)
  - [1.6 删除线索](#16-删除线索)
- [二、外部接口：联系记录 CRUD](#二外部接口联系记录-crud)
  - [2.1 联系记录列表查询](#21-联系记录列表查询)
  - [2.2 联系记录详情查询](#22-联系记录详情查询)
  - [2.3 创建联系记录](#23-创建联系记录)
  - [2.4 批量创建联系记录](#24-批量创建联系记录)
  - [2.5 更新联系记录](#25-更新联系记录)
  - [2.6 删除联系记录](#26-删除联系记录)
- [三、外部接口：商品分类 CRUD](#三外部接口商品分类-crud)
- [四、外部接口：商品 CRUD](#四外部接口商品-crud)
- [五、外部接口：SKU 与阶梯价](#五外部接口sku-与阶梯价)
- [六、外部接口：库存](#六外部接口库存)
- [七、外部接口：工作区查询](#七外部接口工作区查询)
- [八、权限编码说明](#八权限编码说明)
- [九、枚举值速查](#九枚举值速查)
- [十、旧版接口迁移对照](#十旧版接口迁移对照)

---

## 前置准备

### 基础 URL

| 环境 | 地址 |
|---|---|
| 生产环境 | `https://www.mekyro.com/api/v1` |
| 本地开发 | `http://127.0.0.1:8200/api/v1` |
| 本地 Swagger | `http://127.0.0.1:8200/docs` |
| 本地 OpenAPI JSON | `http://127.0.0.1:8200/openapi.json` |

本文接口示例均使用生产环境完整地址。

### 鉴权方式

外部接口统一使用 API Key 鉴权：

| Header | 必填 | 说明 |
|---|---|---|
| `X-Api-Key` | 是 | 在运营后台“API 密钥管理”创建时返回的完整密钥 |
| `Content-Type` | JSON 请求必填 | 固定为 `application/json` |
| `Idempotency-Key` | 库存写入建议必填 | 调用方生成的业务幂等键，重试时保持不变 |

```http
X-Api-Key: mek_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> 每个 API Key 绑定一个工作区，并通过权限编码控制可访问的接口。工作区由服务端根据密钥自动注入，调用方不需要、也不能在请求体中指定 `workspace_id`。

### ID 类型

当前接口中的线索、联系记录、分类、商品、SKU、工作区等 ID 均为 UUID 字符串，例如：

```text
7fd6f590-6ce8-4b75-bc7d-3602a02afd01
```

不再使用旧版接口中的整数自增 ID。

### 响应格式

FastAPI 直接返回资源对象、数组或分页对象，不再返回旧版的：

```json
{"code": 200, "message": "操作成功", "data": {}}
```

分页响应格式：

```json
{
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": []
}
```

错误响应格式：

```json
{
  "detail": "错误原因"
}
```

删除成功统一返回 `204 No Content`，没有响应体。

---

## 一、外部接口：线索 CRUD

> 鉴权：`X-Api-Key`
> 工作区：由 API Key 自动确定

### 1.1 线索列表查询

支持关键字、跟进阶段、国家和来源类型筛选，支持分页。

**所需权限**

```text
lead:read
```

**请求**

```http
GET /external/leads?search=Buyer&stage=new&country=US&source=manual&limit=20&offset=0
X-Api-Key: <your_api_key>
```

| 查询参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `search` | string | 否 | 搜索商家名称、公司名称、联系人、邮箱 |
| `stage` | string | 否 | 跟进阶段 |
| `country` | string | 否 | 两位国家代码，如 `US`、`CN` |
| `source` | string | 否 | 来源类型 |
| `platform` | string | 否 | 兼容旧查询参数，值仍须为 source 枚举；新调用方使用 `source` |
| `limit` | int | 否 | 返回数量，默认 20，最大 100 |
| `offset` | int | 否 | 偏移量，默认 0 |
| `page` | int | 否 | 兼容旧分页，默认第 1 页 |
| `page_size` | int | 否 | 兼容旧分页，最大 100 |

**Postman 配置**

```text
Method:  GET
URL:     https://www.mekyro.com/api/v1/external/leads?stage=new&limit=20&offset=0
Headers: X-Api-Key  <your_api_key>
```

**响应 — 成功（200）**

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
      "source": "other",
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
      "created_at": "2026-08-20T10:00:00Z",
      "updated_at": "2026-08-20T10:00:00Z",
      "latest_contact_at": null
    }
  ]
}
```

**cURL**

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/leads?stage=new&country=US&limit=20&offset=0" \
  -H "X-Api-Key: <your_api_key>"
```

---

### 1.2 线索详情查询

**所需权限**：`lead:read`

**请求**

```http
GET /external/leads/{lead_id}
X-Api-Key: <your_api_key>
```

**Postman 配置**

```text
Method:  GET
URL:     https://www.mekyro.com/api/v1/external/leads/7fd6f590-6ce8-4b75-bc7d-3602a02afd01
Headers: X-Api-Key  <your_api_key>
```

**响应 — 成功（200）**

```json
{
  "id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "workspace_name": "上海芒可忆",
  "source": "other",
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
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:00:00Z",
  "latest_contact_at": null
}
```

**响应 — 不存在或不属于当前工作区（404）**

```json
{"detail": "Lead not found"}
```

**cURL**

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/leads/{lead_id}" \
  -H "X-Api-Key: <your_api_key>"
```

---

### 1.3 创建线索

**所需权限**：`lead:create`

**请求**

```http
POST /external/leads
X-Api-Key: <your_api_key>
Content-Type: application/json
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
  "city": "New York",
  "email": "alex@example.com",
  "recommendation_score": 80,
  "recommendation_reason": "需求匹配"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `source` | string | 否 | 来源类型，默认 `manual` |
| `platform_name` | string | 否 | 具体平台名，如 WhatsApp、LinkedIn |
| `external_ref` | string | 否 | 外部系统唯一标识；不传则由系统生成 |
| `merchant_name` | string | 是 | 商家或客户名称，最长 200 |
| `company_name` | string | 是 | 公司名称，最长 200 |
| `contact_person` | string | 否 | 联系人 |
| `country` | string | 是 | 两位国家代码 |
| `city` | string | 否 | 城市 |
| `zip_code` | string | 否 | 邮编 |
| `description` | string | 否 | 描述，最长 10000 |
| `email` | string | 否 | 邮箱或空字符串 |
| `phone` | string | 否 | 电话 |
| `country_code` | string | 否 | 国际区号，如 `+86` |
| `whatsapp` | string | 否 | WhatsApp 联系方式 |
| `recommendation_score` | int | 否 | 0～100，默认 0 |
| `recommendation_reason` | string | 否 | 推荐理由 |

> 同一工作区内，`source + external_ref` 必须唯一。旧版 `platform` 数据字段已拆分为 `source` 和 `platform_name`，旧版 `merchant_id` 对应当前 `external_ref`。

**响应 — 成功（201）**

```json
{
  "id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "workspace_name": "上海芒可忆",
  "source": "other",
  "platform_name": "LinkedIn",
  "external_ref": "LINKEDIN-10001",
  "merchant_name": "Example Buyer",
  "company_name": "Example Buyer Ltd",
  "contact_person": "Alex",
  "country": "US",
  "city": "New York",
  "zip_code": "",
  "description": "",
  "email": "alex@example.com",
  "phone": "",
  "country_code": "",
  "whatsapp": "",
  "stage": "new",
  "recommendation_score": 0,
  "recommendation_reason": "",
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:00:00Z",
  "latest_contact_at": null
}
```

**响应 — 唯一标识重复（409）**

```json
{"detail": "Lead source and external reference already exist"}
```

**cURL**

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

---

### 1.4 批量创建线索

**所需权限**：`lead:create`

**请求**

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

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `items` | array | 是 | 1～500 条，单项规则与创建线索相同 |

**响应 — 成功（201）**

直接返回线索对象数组：

```json
[
  {"id": "uuid-1", "source": "website", "external_ref": "WEB-10001"},
  {"id": "uuid-2", "source": "other", "external_ref": "WA-10002"}
]
```

批次发生唯一约束冲突时，整批回滚。

**cURL**

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/leads/batch" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"merchant_name":"Buyer One","company_name":"Buyer One Ltd","country":"GB"}]}'
```

---

### 1.5 更新线索

**所需权限**：`lead:update`

**请求**

```http
PATCH /external/leads/{lead_id}
```

```json
{
  "stage": "contacting",
  "contact_person": "Alex Chen",
  "description": "External CRM started outreach"
}
```

所有字段均为可选，只传需要更新的字段。可更新创建字段以及：

| 字段 | 类型 | 说明 |
|---|---|---|
| `stage` | string | 跟进阶段，必须符合阶段流转规则 |
| `recommendation_score` | int | 0～100 |
| `recommendation_reason` | string | 推荐理由 |

**响应 — 成功（200）**

```json
{
  "id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "workspace_name": "上海芒可忆",
  "source": "other",
  "platform_name": "LinkedIn",
  "external_ref": "LINKEDIN-10001",
  "merchant_name": "Example Buyer",
  "company_name": "Example Buyer Ltd",
  "contact_person": "Alex Chen",
  "country": "US",
  "city": "New York",
  "zip_code": "10001",
  "description": "External CRM started outreach",
  "email": "alex@example.com",
  "phone": "",
  "country_code": "+1",
  "whatsapp": "",
  "stage": "contacting",
  "recommendation_score": 80,
  "recommendation_reason": "需求匹配",
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:05:00Z",
  "latest_contact_at": null
}
```

**响应 — 非法阶段流转（409）**

```json
{"detail": "Lead stage cannot transition from ordered to new"}
```

**cURL**

```bash
curl -X PATCH "https://www.mekyro.com/api/v1/external/leads/{lead_id}" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"stage":"contacting"}'
```

---

### 1.6 删除线索

**所需权限**：`lead:delete`

**请求**

```http
DELETE /external/leads/{lead_id}
```

线索和关联联系记录会被删除；已关联订单和报价会保留，但解除线索关联。

**响应 — 成功（204）**

无响应体。

**cURL**

```bash
curl -X DELETE "https://www.mekyro.com/api/v1/external/leads/{lead_id}" \
  -H "X-Api-Key: <your_api_key>"
```

---

## 二、外部接口：联系记录 CRUD

### 2.1 联系记录列表查询

**所需权限**：`lead_contact_log:read`

**请求**

```http
GET /external/leads/{lead_id}/contact-logs?type=customer_inbound&channel=email&limit=50&offset=0
```

| 查询参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `type` | string | 否 | 联系记录类型 |
| `channel` | string | 否 | 联系渠道 |
| `search` | string | 否 | 搜索主题、发送方、接收方和正文 |
| `limit` | int | 否 | 默认 50，最大 200 |
| `offset` | int | 否 | 默认 0 |
| `page`、`page_size` | int | 否 | 兼容旧分页，page_size 最大 200 |

**响应 — 成功（200）**

```json
{
  "total": 1,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": "2cf08872-d61d-4026-bfd8-433c163537ff",
      "lead_id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
      "merchant_name": "Example Buyer",
      "activity_type": "customer_inbound",
      "direction": "inbound",
      "channel": "email",
      "subject": "Re: Product introduction",
      "sender": "alex@example.com",
      "recipient": "sales@mekyro.com",
      "content": "Please send MOQ and pricing.",
      "created_at": "2026-08-20T11:00:00Z"
    }
  ]
}
```

**cURL**

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/leads/{lead_id}/contact-logs?limit=50&offset=0" \
  -H "X-Api-Key: <your_api_key>"
```

---

### 2.2 联系记录详情查询

**所需权限**：`lead_contact_log:read`

```http
GET /external/contact-logs/{activity_id}
```

**响应 — 成功（200）**

```json
{
  "id": "2cf08872-d61d-4026-bfd8-433c163537ff",
  "lead_id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
  "merchant_name": "Example Buyer",
  "activity_type": "customer_inbound",
  "direction": "inbound",
  "channel": "email",
  "subject": "Re: Product introduction",
  "sender": "alex@example.com",
  "recipient": "sales@mekyro.com",
  "content": "Please send MOQ and pricing.",
  "created_at": "2026-08-20T11:00:00Z"
}
```

不存在或跨工作区返回：

```json
{"detail": "Contact activity not found"}
```

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/contact-logs/{activity_id}" \
  -H "X-Api-Key: <your_api_key>"
```

---

### 2.3 创建联系记录

**所需权限**：`lead_contact_log:create`

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

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `activity_type` | string | 否 | `ai_outbound`、`human_outbound`、`customer_inbound` |
| `direction` | string | 否 | `inbound` 或 `outbound`，可由 activity_type 推导 |
| `channel` | string | 是 | `email`、`whatsapp`、`phone`、`meeting`、`other` |
| `subject` | string | 否 | 主题，最长 500 |
| `sender` | string | 否 | 发送方邮箱 |
| `recipient` | string | 否 | 接收方邮箱 |
| `content` | string | 是 | 内容，最长 10000 |

**响应 — 成功（201）**

```json
{
  "id": "2cf08872-d61d-4026-bfd8-433c163537ff",
  "lead_id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
  "merchant_name": "Example Buyer",
  "activity_type": "customer_inbound",
  "direction": "inbound",
  "channel": "whatsapp",
  "subject": "",
  "sender": "",
  "recipient": "",
  "content": "Customer requested pricing and MOQ.",
  "created_at": "2026-08-20T11:00:00Z"
}
```

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/leads/{lead_id}/contact-logs" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"activity_type":"customer_inbound","channel":"whatsapp","content":"Requested pricing."}'
```

---

### 2.4 批量创建联系记录

**所需权限**：`lead_contact_log:create`

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

`items` 最少 1 条、最多 500 条。成功返回 `201` 和联系记录对象数组。

**响应 — 成功（201）**

```json
[
  {
    "id": "2cf08872-d61d-4026-bfd8-433c163537ff",
    "lead_id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
    "merchant_name": "Example Buyer",
    "activity_type": "human_outbound",
    "direction": "outbound",
    "channel": "email",
    "subject": "Product introduction",
    "sender": "sales@mekyro.com",
    "recipient": "alex@example.com",
    "content": "Introduced the current catalog.",
    "created_at": "2026-08-20T11:00:00Z"
  }
]
```

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/leads/{lead_id}/contact-logs/batch" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"channel":"email","content":"Product introduction sent."}]}'
```

---

### 2.5 更新联系记录

**所需权限**：`lead_contact_log:update`

```http
PATCH /external/contact-logs/{activity_id}
```

```json
{
  "activity_type": "customer_inbound",
  "content": "Customer replied and requested a quote."
}
```

可更新 `activity_type`、`channel`、`subject`、`sender`、`recipient`、`content`。更新 `activity_type` 时系统会重新计算 `direction`。

**响应 — 成功（200）**

```json
{
  "id": "2cf08872-d61d-4026-bfd8-433c163537ff",
  "lead_id": "7fd6f590-6ce8-4b75-bc7d-3602a02afd01",
  "merchant_name": "Example Buyer",
  "activity_type": "customer_inbound",
  "direction": "inbound",
  "channel": "email",
  "subject": "Re: Product introduction",
  "sender": "alex@example.com",
  "recipient": "sales@mekyro.com",
  "content": "Customer replied and requested a quote.",
  "created_at": "2026-08-20T11:00:00Z"
}
```

```bash
curl -X PATCH "https://www.mekyro.com/api/v1/external/contact-logs/{activity_id}" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Customer replied."}'
```

---

### 2.6 删除联系记录

**所需权限**：`lead_contact_log:delete`

```http
DELETE /external/contact-logs/{activity_id}
```

成功返回 `204`，无响应体。

```bash
curl -X DELETE "https://www.mekyro.com/api/v1/external/contact-logs/{activity_id}" \
  -H "X-Api-Key: <your_api_key>"
```

---

## 三、外部接口：商品分类 CRUD

### 3.1 分类列表查询

**所需权限**：`product:read`

```http
GET /external/categories
```

成功直接返回分类对象数组：

```json
[
  {
    "id": "1e0748eb-e76d-41df-9874-b8b5b8204519",
    "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
    "name": "Mobile Phones",
    "parent_id": null,
    "sort_order": 0,
    "created_at": "2026-08-20T10:00:00Z",
    "updated_at": "2026-08-20T10:00:00Z"
  }
]
```

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/categories" \
  -H "X-Api-Key: <your_api_key>"
```

### 3.2 分类详情查询

**所需权限**：`product:read`

```http
GET /external/categories/{category_id}
```

成功返回分类对象，完整响应示例如下：

**响应 — 成功（200）**

```json
{
  "id": "1e0748eb-e76d-41df-9874-b8b5b8204519",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "name": "Mobile Phones",
  "parent_id": null,
  "sort_order": 0,
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:00:00Z"
}
```

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/categories/{category_id}" \
  -H "X-Api-Key: <your_api_key>"
```

### 3.3 创建分类

**所需权限**：`product:create`

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

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 分类名称，最长 100 |
| `parent_id` | UUID/null | 否 | 父分类；根分类传 null |
| `sort_order` | int | 否 | 排序值，默认 0 |

**响应 — 成功（201）**

```json
{
  "id": "1e0748eb-e76d-41df-9874-b8b5b8204519",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "name": "Mobile Phones",
  "parent_id": null,
  "sort_order": 0,
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:00:00Z"
}
```

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/categories" \
  -H "X-Api-Key: <your_api_key>" -H "Content-Type: application/json" \
  -d '{"name":"Mobile Phones","parent_id":null,"sort_order":0}'
```

### 3.4 更新分类

**所需权限**：`product:update`

```http
PATCH /external/categories/{category_id}
```

```json
{"name": "Smartphones", "sort_order": 10}
```

可更新 `name`、`parent_id`、`sort_order`。系统会校验工作区、分类层级、循环引用和最大深度。

**响应 — 成功（200）**

```json
{
  "id": "1e0748eb-e76d-41df-9874-b8b5b8204519",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "name": "Smartphones",
  "parent_id": null,
  "sort_order": 10,
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:05:00Z"
}
```

```bash
curl -X PATCH "https://www.mekyro.com/api/v1/external/categories/{category_id}" \
  -H "X-Api-Key: <your_api_key>" -H "Content-Type: application/json" \
  -d '{"name":"Smartphones","sort_order":10}'
```

### 3.5 删除分类

**所需权限**：`product:delete`

```http
DELETE /external/categories/{category_id}
```

成功返回 `204`，无响应体。

```bash
curl -X DELETE "https://www.mekyro.com/api/v1/external/categories/{category_id}" \
  -H "X-Api-Key: <your_api_key>"
```

---

## 四、外部接口：商品 CRUD

### 4.1 商品列表查询

**所需权限**：`product:read`

```http
GET /external/products?search=Phone&status=active&limit=20&offset=0
```

| 查询参数 | 说明 |
|---|---|
| `search` | 搜索商品名称、描述 |
| `category_id` | 分类及后代分类 UUID |
| `brand_id` | 品牌分类 UUID |
| `brand_name` | 品牌分类名称 |
| `status` | `active` 或 `inactive` |
| `limit`、`offset` | 默认 20/0，limit 最大 100 |
| `page`、`page_size` | 兼容旧分页方式 |
| `include_skus` | 兼容旧参数；当前响应始终包含未删除 SKU |

**响应 — 成功（200）**

```json
{
  "total": 1,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "id": "36b40379-600f-4438-b682-842cb2ed9582",
      "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
      "category_id": "1e0748eb-e76d-41df-9874-b8b5b8204519",
      "name": "Refurbished Smartphone",
      "description": "Grade A refurbished device",
      "specification_template": [],
      "status": "active",
      "variants": [],
      "images": [],
      "is_deleted": false,
      "deleted_at": null,
      "created_at": "2026-08-20T10:00:00Z",
      "updated_at": "2026-08-20T10:00:00Z",
      "sku_count": 0,
      "total_stock": 0
    }
  ]
}
```

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/products?status=active&limit=20&offset=0" \
  -H "X-Api-Key: <your_api_key>"
```

### 4.2 商品详情查询

**所需权限**：`product:read`

```http
GET /external/products/{product_id}
```

成功返回包含商品、未删除 SKU、阶梯价和图片的完整商品对象，示例如下：

**响应 — 成功（200）**

```json
{
  "id": "36b40379-600f-4438-b682-842cb2ed9582",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "category_id": "1e0748eb-e76d-41df-9874-b8b5b8204519",
  "name": "Refurbished Smartphone",
  "description": "Grade A refurbished device",
  "specification_template": [],
  "status": "active",
  "variants": [],
  "images": [],
  "is_deleted": false,
  "deleted_at": null,
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:00:00Z",
  "sku_count": 0,
  "total_stock": 0
}
```

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/products/{product_id}" \
  -H "X-Api-Key: <your_api_key>"
```

### 4.3 创建商品（可同时创建 SKU）

**所需权限**：`product:create`

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

| 商品字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `category_id` | UUID/null | 否 | 分类 ID |
| `name` | string | 是 | 商品名，最长 200 |
| `description` | string | 否 | 描述，最长 10000 |
| `specification_template` | array | 否 | 规格模板，最多 100 项 |
| `status` | string | 否 | `active` 或 `inactive` |
| `images` | array | 否 | 商品图片 URL，最多 5 张 |
| `detail_image` | string | 否 | 商品详情图片 URL |
| `variants` | array | 否 | SKU 数组，最多 500 条 |

| SKU 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `sku_code` | string | 是 | 工作区内唯一，最长 100 |
| `specifications` | object | 否 | 规格键值 |
| `minimum_order_quantity` | int | 否 | 最小起订量，默认 1 |
| `currency` | string | 否 | 三位大写币种，默认 USD |
| `stock_quantity` | int | 否 | 初始库存，不得小于 0 |
| `status` | string | 否 | active/inactive |
| `price_tiers` | array | 否 | 阶梯价，数量必须唯一且升序 |
| `image` | string | 否 | SKU 图片 URL |

**响应 — 成功（201）**

```json
{
  "id": "36b40379-600f-4438-b682-842cb2ed9582",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "category_id": "1e0748eb-e76d-41df-9874-b8b5b8204519",
  "name": "Refurbished Smartphone",
  "description": "Grade A refurbished device",
  "specification_template": [{"name":"Storage","options":["128GB","256GB"]}],
  "status": "active",
  "variants": [{
    "id": "3ecba047-6486-4c60-8566-a40e15d313c5",
    "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
    "product_id": "36b40379-600f-4438-b682-842cb2ed9582",
    "sku_code": "PHONE-A-128",
    "specifications": {"Grade":"A","Storage":"128GB"},
    "minimum_order_quantity": 1,
    "currency": "USD",
    "stock_quantity": 10,
    "status": "active",
    "price_tiers": [{"minimum_quantity":1,"unit_price":"299.00"}],
    "images": [],
    "is_deleted": false,
    "deleted_at": null,
    "created_at": "2026-08-20T10:00:00Z",
    "updated_at": "2026-08-20T10:00:00Z"
  }],
  "images": [],
  "is_deleted": false,
  "deleted_at": null,
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:00:00Z",
  "sku_count": 1,
  "total_stock": 10
}
```

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/products" \
  -H "X-Api-Key: <your_api_key>" -H "Content-Type: application/json" \
  -d '{"name":"Example Product","variants":[{"sku_code":"EXAMPLE-SKU-001"}]}'
```

### 4.4 更新商品

**所需权限**：`product:update`

```http
PATCH /external/products/{product_id}
```

```json
{"description": "Updated by external system", "status": "active"}
```

支持 `category_id`、`name`、`description`、`specification_template`、`status`。

**响应 — 成功（200）**

**响应 — 成功（200）**

```json
{
  "id": "36b40379-600f-4438-b682-842cb2ed9582",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "category_id": "1e0748eb-e76d-41df-9874-b8b5b8204519",
  "name": "Refurbished Smartphone",
  "description": "Updated by external system",
  "specification_template": [],
  "status": "active",
  "variants": [],
  "images": [],
  "is_deleted": false,
  "deleted_at": null,
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:05:00Z",
  "sku_count": 0,
  "total_stock": 0
}
```

```bash
curl -X PATCH "https://www.mekyro.com/api/v1/external/products/{product_id}" \
  -H "X-Api-Key: <your_api_key>" -H "Content-Type: application/json" \
  -d '{"description":"Updated by external system","status":"active"}'
```

### 4.5 删除商品

**所需权限**：`product:delete`

```http
DELETE /external/products/{product_id}
```

执行软删除，同时软删除其 SKU。成功返回 `204`。外部 API 不开放恢复和永久删除接口。

```bash
curl -X DELETE "https://www.mekyro.com/api/v1/external/products/{product_id}" \
  -H "X-Api-Key: <your_api_key>"
```

---

## 五、外部接口：SKU 与阶梯价

### 5.1 SKU 列表查询

**所需权限**：`product:read`

```http
GET /external/variants?search=PHONE&status=active&stock=in_stock&limit=50&offset=0
```

支持：`search`、`status`、`stock`、`category_id`、`brand_id`、`brand_name`、`product_id`、`spec_key`、`spec_value`、`ordering`、`limit/offset`、`page/page_size`。

多规格筛选：

```http
GET /external/variants?spec_key=Grade,Storage&spec_value=A,128GB
```

成功直接返回 SKU 对象数组，不包含分页包装。

**响应 — 成功（200）**

```json
[
  {
    "id": "3ecba047-6486-4c60-8566-a40e15d313c5",
    "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
    "product_id": "36b40379-600f-4438-b682-842cb2ed9582",
    "sku_code": "PHONE-A-128",
    "specifications": {"Grade": "A", "Storage": "128GB"},
    "minimum_order_quantity": 1,
    "currency": "USD",
    "stock_quantity": 10,
    "status": "active",
    "price_tiers": [{"minimum_quantity": 1, "unit_price": "299.00"}],
    "images": [],
    "is_deleted": false,
    "deleted_at": null,
    "created_at": "2026-08-20T10:00:00Z",
    "updated_at": "2026-08-20T10:00:00Z"
  }
]
```

**cURL**

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/variants?search=PHONE&status=active&stock=in_stock&limit=50&offset=0" \
  -H "X-Api-Key: <your_api_key>"
```

### 5.2 SKU 详情查询

**所需权限**：`product:read`

```http
GET /external/variants/{variant_id}
```

成功返回包含 SKU、阶梯价和图片信息的完整对象，示例如下：

**响应 — 成功（200）**

```json
{
  "id": "3ecba047-6486-4c60-8566-a40e15d313c5",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "product_id": "36b40379-600f-4438-b682-842cb2ed9582",
  "sku_code": "PHONE-A-128",
  "specifications": {"Grade": "A", "Storage": "128GB"},
  "minimum_order_quantity": 1,
  "currency": "USD",
  "stock_quantity": 10,
  "status": "active",
  "price_tiers": [{"minimum_quantity": 1, "unit_price": "299.00"}],
  "images": [],
  "is_deleted": false,
  "deleted_at": null,
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:00:00Z"
}
```

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/variants/{variant_id}" \
  -H "X-Api-Key: <your_api_key>"
```

### 5.3 追加 SKU

**所需权限**：`product:create`

```http
POST /external/products/{product_id}/variants
```

```json
{
  "sku_code": "PHONE-A-256",
  "specifications": {"Grade": "A", "Storage": "256GB"},
  "minimum_order_quantity": 2,
  "currency": "USD",
  "stock_quantity": 20,
  "status": "active",
  "price_tiers": [
    {"minimum_quantity": 2, "unit_price": "329.00"}
  ]
}
```

**响应 — 成功（201）**

```json
{
  "id": "3ecba047-6486-4c60-8566-a40e15d313c5",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "product_id": "36b40379-600f-4438-b682-842cb2ed9582",
  "sku_code": "PHONE-A-256",
  "specifications": {"Grade":"A","Storage":"256GB"},
  "minimum_order_quantity": 2,
  "currency": "USD",
  "stock_quantity": 20,
  "status": "active",
  "price_tiers": [{"minimum_quantity":2,"unit_price":"329.00"}],
  "images": [],
  "is_deleted": false,
  "deleted_at": null,
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:00:00Z"
}
```

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/products/{product_id}/variants" \
  -H "X-Api-Key: <your_api_key>" -H "Content-Type: application/json" \
  -d '{"sku_code":"PHONE-A-256","stock_quantity":20,"price_tiers":[{"minimum_quantity":2,"unit_price":"329.00"}]}'
```

### 5.4 更新 SKU

**所需权限**：`product:update`

```http
PATCH /external/variants/{variant_id}
```

```json
{
  "minimum_order_quantity": 5,
  "specifications": {"Grade": "A", "Storage": "256GB", "Color": "Black"}
}
```

可更新 `sku_code`、`specifications`、`minimum_order_quantity`、`currency`、`stock_quantity`、`status`、`price`、`product_name`、`product_category_id`。

**响应 — 成功（200）**

**响应 — 成功（200）**

```json
{
  "id": "3ecba047-6486-4c60-8566-a40e15d313c5",
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "product_id": "36b40379-600f-4438-b682-842cb2ed9582",
  "sku_code": "PHONE-A-128",
  "specifications": {"Grade":"A","Storage":"256GB"},
  "minimum_order_quantity": 5,
  "currency": "USD",
  "stock_quantity": 10,
  "status": "active",
  "price_tiers": [{"minimum_quantity":1,"unit_price":"299.00"}],
  "images": [],
  "is_deleted": false,
  "deleted_at": null,
  "created_at": "2026-08-20T10:00:00Z",
  "updated_at": "2026-08-20T10:05:00Z"
}
```

```bash
curl -X PATCH "https://www.mekyro.com/api/v1/external/variants/{variant_id}" \
  -H "X-Api-Key: <your_api_key>" -H "Content-Type: application/json" \
  -d '{"minimum_order_quantity":5,"status":"active"}'
```

### 5.5 删除 SKU

**所需权限**：`product:delete`

```http
DELETE /external/variants/{variant_id}
```

执行软删除，成功返回 `204`。

```bash
curl -X DELETE "https://www.mekyro.com/api/v1/external/variants/{variant_id}" \
  -H "X-Api-Key: <your_api_key>"
```

### 5.6 覆盖式更新阶梯价

**所需权限**：`product:update`

```http
PUT /external/variants/{variant_id}/price-tiers
```

```json
[
  {"minimum_quantity": 1, "unit_price": "299.00"},
  {"minimum_quantity": 10, "unit_price": "279.00"}
]
```

请求体为数组，会覆盖该 SKU 原有全部阶梯价。成功返回新的阶梯价数组。

**响应 — 成功（200）**

```json
[
  {"minimum_quantity": 1, "unit_price": "299.00"},
  {"minimum_quantity": 10, "unit_price": "279.00"}
]
```

```bash
curl -X PUT "https://www.mekyro.com/api/v1/external/variants/{variant_id}/price-tiers" \
  -H "X-Api-Key: <your_api_key>" -H "Content-Type: application/json" \
  -d '[{"minimum_quantity":1,"unit_price":"299.00"}]'
```

### 5.7 批量更新 SKU

**所需权限**：`product:update`

```http
PATCH /external/batch/variants
```

```json
[
  {"id": "uuid-1", "minimum_order_quantity": 3},
  {"id": "uuid-2", "status": "inactive"}
]
```

请求体为数组，最少 1 条、最多 500 条。成功返回更新后的 SKU 数组。

**响应 — 成功（200）**

**响应 — 成功（200）**

```json
[
  {
    "id": "3ecba047-6486-4c60-8566-a40e15d313c5",
    "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
    "product_id": "36b40379-600f-4438-b682-842cb2ed9582",
    "sku_code": "PHONE-A-128",
    "specifications": {"Grade":"A","Storage":"128GB"},
    "minimum_order_quantity": 1,
    "currency": "USD",
    "stock_quantity": 10,
    "status": "active",
    "price_tiers": [{"minimum_quantity":1,"unit_price":"299.00"}],
    "images": [],
    "is_deleted": false,
    "deleted_at": null,
    "created_at": "2026-08-20T10:00:00Z",
    "updated_at": "2026-08-20T10:00:00Z"
  }
]
```

```bash
curl -X PATCH "https://www.mekyro.com/api/v1/external/batch/variants" \
  -H "X-Api-Key: <your_api_key>" -H "Content-Type: application/json" \
  -d '[{"id":"<variant_uuid>","status":"inactive"}]'
```

### 5.8 批量覆盖阶梯价

**所需权限**：`product:update`

```http
PUT /external/batch/price-tiers
```

```json
[
  {
    "variant_id": "uuid-1",
    "price_tiers": [{"minimum_quantity": 3, "unit_price": "269.00"}]
  },
  {
    "variant_id": "uuid-2",
    "price_tiers": [{"minimum_quantity": 5, "unit_price": "249.00"}]
  }
]
```

成功返回：

```json
[
  {"variant_id": "uuid-1", "price_tiers": [{"minimum_quantity": 3, "unit_price": "269.00"}]}
]
```

```bash
curl -X PUT "https://www.mekyro.com/api/v1/external/batch/price-tiers" \
  -H "X-Api-Key: <your_api_key>" -H "Content-Type: application/json" \
  -d '[{"variant_id":"<variant_uuid>","price_tiers":[{"minimum_quantity":1,"unit_price":"99.00"}]}]'
```

---

## 六、外部接口：库存

### 6.1 库存流水列表查询

**所需权限**：`product_inventory:read`

```http
GET /external/inventory-movements?variant_id={variant_id}&type=inbound&limit=50&offset=0
```

| 查询参数 | 说明 |
|---|---|
| `variant_id` | SKU UUID |
| `type` | `inbound`、`outbound`、`adjustment` |
| `search` | 搜索 SKU、商品名、原因和引用号 |
| `ordering` | created_at、quantity_delta、balance_after、sku_code、product_name 等，前加 `-` 为倒序 |
| `limit`、`offset` | 默认 50/0，limit 最大 100 |
| `page`、`page_size` | 兼容旧分页 |

**响应 — 成功（200）**

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
      "reference": "PO-20260820-001",
      "created_by": "api-key-name",
      "created_at": "2026-08-20T10:00:00Z"
    }
  ]
}
```

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/inventory-movements?variant_id={variant_id}" \
  -H "X-Api-Key: <your_api_key>"
```

### 6.2 创建出入库记录

**所需权限**：`product_inventory:create`

```http
POST /external/inventory-adjustments
Idempotency-Key: inventory-order-20260820-0001
```

```json
{
  "variant_id": "3ecba047-6486-4c60-8566-a40e15d313c5",
  "movement_type": "inbound",
  "quantity_delta": 10,
  "reason": "Purchase receipt",
  "reference": "PO-20260820-001"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `variant_id` | UUID | 是 | SKU ID |
| `movement_type` | string | 否 | 默认 adjustment |
| `quantity_delta` | int | 是 | 变动数量 |
| `reason` | string | 是 | 原因，最长 500 |
| `reference` | string | 否 | 外部单据号，最长 120 |

方向规则：`inbound` 必须为正数，`outbound` 必须为负数，`adjustment` 可正可负，调整后库存不能小于 0。

**响应 — 成功（201）**

```json
{
  "movement_id": "8b36838d-e132-4233-8fb5-3d5816251f98",
  "variant_id": "3ecba047-6486-4c60-8566-a40e15d313c5",
  "sku_code": "PHONE-A-128",
  "movement_type": "inbound",
  "quantity_delta": 10,
  "balance_after": 20,
  "reason": "Purchase receipt",
  "reference": "PO-20260820-001",
  "created_by": "api-key-name"
}
```

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/inventory-adjustments" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Idempotency-Key: inventory-order-20260820-0001" \
  -H "Content-Type: application/json" \
  -d '{"variant_id":"<variant_uuid>","movement_type":"inbound","quantity_delta":10,"reason":"Purchase receipt"}'
```

### 6.3 批量创建出入库记录

**所需权限**：`product_inventory:create`

```http
POST /external/batch/inventory-adjustments
Idempotency-Key: inventory-batch-20260820-0001
```

> 请求体直接是数组，不是 `{ "items": [...] }`。

```json
[
  {
    "variant_id": "uuid-1",
    "movement_type": "inbound",
    "quantity_delta": 10,
    "reason": "Purchase receipt"
  },
  {
    "variant_id": "uuid-2",
    "movement_type": "outbound",
    "quantity_delta": -2,
    "reason": "Order allocation"
  }
]
```

最少 1 条、最多 500 条。成功返回 `201`：

```json
{
  "items": [
    {
      "movement_id": "movement-uuid",
      "variant_id": "uuid-1",
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

**cURL**

```bash
curl -X POST "https://www.mekyro.com/api/v1/external/batch/inventory-adjustments" \
  -H "X-Api-Key: <your_api_key>" \
  -H "Idempotency-Key: inventory-batch-20260820-0001" \
  -H "Content-Type: application/json" \
  -d '[{"variant_id":"uuid-1","movement_type":"inbound","quantity_delta":10,"reason":"Purchase receipt"},{"variant_id":"uuid-2","movement_type":"outbound","quantity_delta":-2,"reason":"Order allocation"}]'
```

---

## 七、外部接口：工作区查询

### 7.1 查询工作区提示词和每日线索量

**所需权限**：`workspace:read`

```http
GET /external/workspace/prompt
```

**响应 — 成功（200）**

```json
{
  "workspace_id": "b108d4ab-f7a7-491f-bff6-285e31feb5c9",
  "workspace_name": "上海芒可忆",
  "prompt": "目标客户和获客要求",
  "daily_lead_limit": 50
}
```

```bash
curl -X GET "https://www.mekyro.com/api/v1/external/workspace/prompt" \
  -H "X-Api-Key: <your_api_key>"
```

---

## 八、权限编码说明

| 权限编码 | 可访问的操作 |
|---|---|
| `workspace:read` | 查询工作区提示词和每日线索量 |
| `lead:read` | 线索列表、详情 |
| `lead:create` | 创建、批量创建线索 |
| `lead:update` | 更新线索 |
| `lead:delete` | 删除线索 |
| `lead_contact_log:read` | 联系记录列表、详情 |
| `lead_contact_log:create` | 创建、批量创建联系记录 |
| `lead_contact_log:update` | 更新联系记录 |
| `lead_contact_log:delete` | 删除联系记录 |
| `product:read` | 查询分类、商品、SKU |
| `product:create` | 创建分类、商品、SKU |
| `product:update` | 更新分类、商品、SKU、阶梯价 |
| `product:delete` | 删除分类、商品、SKU |
| `product_inventory:read` | 查询库存流水 |
| `product_inventory:create` | 单条、批量出入库 |

权限不足返回：

```json
{
  "detail": "API key permission required: lead:create"
}
```

---

## 九、枚举值速查

### 线索来源 source

```text
manual, website, amazon, trade_show, other
```

### 线索阶段 stage

```text
new, contacting, replied, qualified, quoting, ordered, lost
```

允许的阶段流转：

```text
new -> contacting | lost
contacting -> replied | qualified | lost
replied -> qualified | lost
qualified -> quoting | lost
quoting -> ordered | lost
ordered -> 终态
lost -> 终态
```

### 联系记录类型 activity_type

```text
ai_outbound, human_outbound, customer_inbound
```

### 联系方向 direction

```text
inbound, outbound
```

### 联系渠道 channel

```text
email, whatsapp, phone, meeting, other
```

### 商品和 SKU 状态

```text
active, inactive
```

### 库存类型 movement_type

```text
inbound, outbound, adjustment
```

---

## 十、旧版接口迁移对照

| 旧版 Django 接口 | 当前 FastAPI 接口 |
|---|---|
| `GET /api/external/leads/` | `GET /api/v1/external/leads` |
| `POST /api/external/leads/create/` | `POST /api/v1/external/leads` |
| `POST /api/external/leads/batch-create/` | `POST /api/v1/external/leads/batch` |
| `PATCH /api/external/leads/{id}/update/` | `PATCH /api/v1/external/leads/{lead_id}` |
| `DELETE /api/external/leads/{id}/delete/` | `DELETE /api/v1/external/leads/{lead_id}` |
| `POST /api/external/leads/{id}/contact-logs/create/` | `POST /api/v1/external/leads/{lead_id}/contact-logs` |
| `POST /api/external/leads/{id}/contact-logs/batch-create/` | `POST /api/v1/external/leads/{lead_id}/contact-logs/batch` |
| `/api/external/products/{id}/skus/` | `/api/v1/external/products/{product_id}/variants` |
| `/api/external/skus/{id}/inventory-logs/` | `/api/v1/external/inventory-movements?variant_id={variant_id}` |

字段变化：

| 旧字段 | 当前字段 |
|---|---|
| 整数 `id` | UUID 字符串 `id` |
| `platform` | `source` + `platform_name` |
| `merchant_id` | `external_ref` |
| `ws_lead_id` | `lead_id` |
| 联系记录 `type` | `activity_type` |
| `email_title` | `subject` |
| `email_sender` | `sender` |
| `skus` | `variants` |
| 库存 `type` | `movement_type` |
| 库存 `quantity` | `quantity_delta` |
| `reference_id` | `reference` |

### 通用错误示例

**缺少 API Key（401）**

```json
{"detail": "Missing API key"}
```

**API Key 无效（401）**

```json
{"detail": "Invalid API key"}
```

**API Key 已停用（401）**

```json
{"detail": "API key is disabled"}
```

**参数校验失败（422）**

```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "merchant_name"],
      "msg": "Field required"
    }
  ]
}
```

### 接入建议

1. 每个外部服务单独创建 API Key，不要共用。
2. 只授予实际需要的最小权限。
3. 线索同步稳定提供 `source + external_ref`，避免重复写入。
4. 库存写入始终提供稳定的 `Idempotency-Key`，重试时复用同一个值。
5. 正确处理 401、403、409、422，不要对业务错误无限重试。
6. 正式接入前先在测试工作区联调。
