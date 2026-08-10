from fastapi import APIRouter, Request
from sqlalchemy import text

from app.core.dependencies import SessionDep

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(session: SessionDep) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


@router.get("/metrics")
async def metrics(request: Request) -> dict:
    """Return process-local request counters for liveness and local diagnosis."""
    return request.app.state.request_metrics.snapshot()
