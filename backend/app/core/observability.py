import json
import logging
import re
from collections import defaultdict
from time import perf_counter
from uuid import uuid4

from fastapi import Request, Response

logger = logging.getLogger("uvicorn.error")
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


class RequestMetrics:
    """Small process-local metrics store for health checks and local operations."""

    def __init__(self) -> None:
        self._counts: defaultdict[tuple[str, str, int], int] = defaultdict(int)
        self._durations_ms: defaultdict[tuple[str, str], float] = defaultdict(float)

    def record(self, method: str, path: str, status_code: int, duration_ms: float) -> None:
        self._counts[(method, path, status_code)] += 1
        self._durations_ms[(method, path)] += duration_ms

    def snapshot(self) -> dict:
        requests = [
            {
                "method": method,
                "path": path,
                "status_code": status_code,
                "count": count,
            }
            for (method, path, status_code), count in sorted(self._counts.items())
        ]
        durations = [
            {
                "method": method,
                "path": path,
                "total_duration_ms": round(duration, 3),
            }
            for (method, path), duration in sorted(self._durations_ms.items())
        ]
        return {"requests": requests, "durations": durations}


def request_id(request: Request) -> str:
    supplied = request.headers.get("X-Request-ID", "")
    return supplied if _REQUEST_ID.fullmatch(supplied) else str(uuid4())


async def observe_request(request: Request, call_next) -> Response:
    started = perf_counter()
    correlation_id = request_id(request)
    request.state.request_id = correlation_id
    response = await call_next(request)
    duration_ms = (perf_counter() - started) * 1000
    route = request.scope.get("route")
    path = getattr(route, "path", None) or request.url.path
    metrics: RequestMetrics = request.app.state.request_metrics
    metrics.record(request.method.upper(), path, response.status_code, duration_ms)
    response.headers["X-Request-ID"] = correlation_id
    logger.info(
        json.dumps(
            {
                "event": "http_request",
                "request_id": correlation_id,
                "method": request.method.upper(),
                "path": path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 3),
            },
            ensure_ascii=True,
        )
    )
    return response
