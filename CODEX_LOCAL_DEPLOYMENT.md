# Mekyro 本地部署与启动说明（给 Codex）

## 目标

请在本目录启动一套完全独立的 Mekyro 本地测试环境，包含：

- React 前端
- FastAPI 后端（`backend`）
- PostgreSQL 16

本地环境使用脱敏测试数据。不要导入 `mekyro.sql`，不要连接生产数据库，也不要使用生产账号、API Key、Shopify 凭证或客户数据。

## 前置条件

- 已安装并启动 Docker Desktop
- Docker Compose 可用：`docker compose version`
- 能访问 Docker 镜像和 npm/pip 依赖源
- 推荐可用磁盘空间至少 5 GB

## 启动

请在本文件所在目录执行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

首次构建会下载 PostgreSQL、Python 和 Node/Nginx 镜像，并安装依赖，可能需要数分钟。

检查容器状态：

```bash
docker compose -f docker-compose.local.yml ps
```

预期 `postgres`、`backend`、`frontend` 都处于运行状态，其中后端和数据库应为 healthy。

## 访问地址

- 前端：<http://127.0.0.1:3100>
- FastAPI 健康检查：<http://127.0.0.1:8200/api/v1/health>
- FastAPI OpenAPI：<http://127.0.0.1:8200/docs>

只需要人工测试时，打开前端地址即可。前端 Nginx 会把 `/api/` 和 `/media/` 请求转发到 FastAPI。

## 本地测试账号

所有账号的密码均为 `Mekyro123!`：

| 账号 | 角色 | 用途 |
|---|---|---|
| `ops` | 平台管理员 | 运营端、租户和供应商管理 |
| `newlife` | New Life Workspace 所有者 | 供应商业务流程 |
| `aurora` | Aurora Workspace 所有者 | 租户切换与隔离验证 |

## 数据库行为

容器启动时会自动执行：

1. Alembic 迁移到最新版本
2. 写入脱敏 fake database 测试数据
3. 启动 FastAPI

数据库数据保存在 Docker volume `mekyro_postgres_data`，上传文件保存在 `mekyro_uploads`。

本仓库不提交数据库快照。正常启动时后端会自动执行 Alembic 迁移并写入脱敏 fake seed，因此不需要手工导入 SQL。测试数据仅用于本地验证，不应部署到公网或生产环境。

## 重置测试数据

需要恢复干净的测试环境时执行：

```bash
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d --build
```

注意：`down -v` 会删除本机这套测试数据库和上传文件，不影响其他电脑或生产环境。

## 常见问题

### 端口被占用

如果 `3100` 或 `8200` 已被占用，先查看：

```bash
lsof -nP -iTCP:3100 -sTCP:LISTEN
lsof -nP -iTCP:8200 -sTCP:LISTEN
```

优先关闭占用进程；如必须改端口，需要同步修改 `docker-compose.local.yml` 的端口映射，并保持容器内部端口 `3100`、`8200` 不变。

### 查看日志

```bash
docker compose -f docker-compose.local.yml logs -f backend
docker compose -f docker-compose.local.yml logs -f frontend
docker compose -f docker-compose.local.yml logs -f postgres
```

### 停止环境

```bash
docker compose -f docker-compose.local.yml down
```

## 给 Codex 的执行约束

- 先读取本文件和 `docker-compose.local.yml`，再执行启动命令。
- 只操作本地 Docker 环境，不访问生产数据库。
- 不导入或修改 `mekyro.sql`；它仅用于业务理解，不属于本地启动数据源。
- 不把真实密码、API Key、短信/邮件凭证或客户数据写入代码和提交物。
- 启动后验证前端、后端 health endpoint 和容器健康状态，再报告结果。
- 遇到错误时先收集 `docker compose ... logs`，不要删除卷，除非用户明确要求重置数据。
