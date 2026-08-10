from collections import defaultdict
from time import monotonic

from fastapi import Request
from fastapi.responses import JSONResponse

from app.core.client_ip import resolve_client_ip


class FixedWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self.limit = max(0, limit)
        self.window_seconds = window_seconds
        self._windows: defaultdict[str, tuple[float, int]] = defaultdict(lambda: (0.0, 0))

    def check(self, key: str) -> tuple[bool, int, int]:
        now = monotonic()
        start, count = self._windows[key]
        if now - start >= self.window_seconds:
            start, count = now, 0
        if self.limit and count >= self.limit:
            self._windows[key] = (start, count)
            retry_after = max(1, int(self.window_seconds - (now - start)))
            return False, 0, retry_after
        count += 1
        self._windows[key] = (start, count)
        return True, max(0, self.limit - count) if self.limit else 0, 0


PUBLIC_INQUIRY_PATHS = frozenset({"/api/v1/inquiries/suppliers", "/api/v1/inquiries/buyers"})


async def enforce_public_rate_limit(request: Request, call_next):
    if request.method.upper() == "POST" and request.url.path in PUBLIC_INQUIRY_PATHS:
        limiter: FixedWindowRateLimiter = request.app.state.public_inquiry_limiter
        settings = request.app.state.settings
        client_host = resolve_client_ip(request, settings.trusted_proxy_cidrs)
        allowed, remaining, retry_after = limiter.check(client_host)
        if not allowed:
            response = JSONResponse(
                status_code=429,
                content={"detail": "Too many public inquiry submissions"},
                headers={"Retry-After": str(retry_after), "X-RateLimit-Limit": str(limiter.limit)},
            )
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            return response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limiter.limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
    return await call_next(request)
