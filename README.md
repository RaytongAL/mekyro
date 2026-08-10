# Mekyro

本仓库包含当前可运行的 React 前端、FastAPI 后端和 PostgreSQL 本地测试环境。

## 目录

- `frontend`：React + Vite 前端
- `backend`：FastAPI 后端、Alembic 迁移和脱敏 fake seed
- `docker-compose.local.yml`：本地 PostgreSQL、后端和前端编排
- `CODEX_LOCAL_DEPLOYMENT.md`：完整的本地部署、测试账号和故障处理说明

## 快速启动

需要 Docker Desktop 和 Docker Compose。在仓库根目录执行：

```bash
docker compose -f docker-compose.local.yml up -d --build
```

打开 <http://127.0.0.1:3100>，后端健康检查位于 <http://127.0.0.1:8200/api/v1/health>。

本地启动只使用脱敏测试数据，不要导入生产 `mekyro.sql`，也不要把本地配置改成生产凭据或生产数据库。

## 代码验证

后端测试：

```bash
cd backend
pytest
```

前端构建：

```bash
cd frontend
npm ci
npm run build
```

## 开发约定

本仓库是前端、后端、数据库迁移和部署配置的唯一正式工作目录。不要再从旧的
`Mekyro-main` 或 `Mekyro-fastapi` 目录复制代码回来覆盖本仓库。

每项修改使用独立分支：

```bash
git switch -c fix/具体功能
git add .
git commit -m "fix: 修复具体功能"
git push -u origin fix/具体功能
```
