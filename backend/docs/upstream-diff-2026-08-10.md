# Mekyro-main-new 增量对齐记录

对比基线：

- 旧 Django/React：`Mekyro-main`
- 新 Django/React：`Mekyro-main-new`
- 实施目标：当前仓库的 FastAPI/React

## 已实施增量

| 上游变化 | FastAPI/React 处理 | 验证 |
|---|---|---|
| Workspace 增加邮件外展开关 | 保留 Workspace 字段，默认开启；运营端可查看和修改 | Workspace 与前端构建测试 |
| 新线索自动触发邮件外展 | 使用事务内 outbox，不使用 Django daemon thread；固定租户头和幂等键 | `test_lead_creation_enqueues_workspace_scoped_email_outreach` |
| Vendure 商品、变体、库存同步 | 新增异步 GraphQL client、同步服务和 outbox worker | `test_vendure_catalog_sync_is_automatic_and_workspace_scoped` |
| Vendure 租户配置 | 使用 Workspace URL 和 Channel Token，全局 API Key 只从环境变量读取 | 前端 build 与 Workspace API 测试 |
| 商品导入和 CRUD 触发 Vendure | 商品、SKU、价格、图片和库存写入统一进入 catalog sync outbox | 全量 pytest |
| SKU 编辑基础价格 | FastAPI PATCH 更新最低数量阶梯价；运营端和供应商端可编辑 | `test_variant_price_update_persists_and_keeps_tenant_boundary` |
| 库存日志按 SKU 过滤 | legacy adapter 将 `sku_id` 映射为 FastAPI `variant_id` | 前端 build 与既有库存测试 |
| 线索需求改用 Workspace prompt | prompt 作为新流程权威值；显式历史 onboarding 值仍优先读取 | onboarding 与 Workspace 回归测试 |

## 未直接覆盖的新包差异

| 差异 | 处理决定 |
|---|---|
| Django 使用后台线程调用外部服务 | 不照搬；线程会丢任务且无法可靠重试，继续使用现有 outbox 架构 |
| 新前端移除 FastAPI legacy adapter | 不应用；当前 React 仍需要该适配层连接 FastAPI API |
| 新前端移除供应商线索新建/编辑入口 | 暂不删除现有能力；后端权限和租户边界已覆盖，避免无明确产品决策时降级功能 |
| 新包中的真实第三方凭据示例 | 不复制；仓库仅保留空环境变量 |
| Django 整数 ID | 不复制；当前 FastAPI 使用 UUID，前端适配层负责接口兼容 |

## 租户安全结论

- 邮件外展消息的 `workspace_id` 来自已鉴权 Workspace，处理时再次按 `lead_id + workspace_id` 查询。
- Vendure outbox 只对配置了 Channel Token 的 Vendure/independent Workspace 入队。
- Vendure worker 按 `Product.workspace_id` 加载商品；消息夹带其他 Workspace 商品 ID 时直接失败，不调用外部 API。
- 第三方凭据不进入响应明文、日志 payload 或测试数据。
