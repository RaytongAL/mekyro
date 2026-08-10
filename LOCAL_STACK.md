# Mekyro 本地整套环境

本环境使用 React、FastAPI 与 PostgreSQL 16。`mekyro.sql` 仅用于核对旧业务含义，
不会导入其中的生产用户、密钥、验证码、联系方式或业务数据。

## 启动

```bash
docker compose -f docker-compose.local.yml up -d --build
```

访问地址：

- React: http://127.0.0.1:3100
- FastAPI: http://127.0.0.1:8200
- OpenAPI: http://127.0.0.1:8200/docs
- PostgreSQL: `127.0.0.1:55432`

`worker` 容器负责处理 Shopify、Vendure 和线索邮件外展 outbox。未配置对应 API Key 时，
本地业务接口仍可测试，但不会成功调用外部系统。

本地测试账号的密码均为 `Mekyro123!`：

- `ops`：平台管理员
- `newlife`：New Life Workspace 所有者
- `aurora`：Aurora Workspace 所有者

## 停止与重置

```bash
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml down -v
```

第二条命令会删除本地 PostgreSQL 测试数据卷。再次启动时会执行 Alembic 迁移并写入脱敏测试数据。
