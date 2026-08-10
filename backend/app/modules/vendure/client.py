import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from app.core.config import Settings
from app.core.models import Workspace


class VendureAPIError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 0,
        errors: list[dict] | None = None,
        retryable: bool = False,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.errors = errors or []
        self.retryable = retryable


class VendureGraphQLError(VendureAPIError):
    pass


class VendureClient:
    RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

    def __init__(
        self,
        workspace: Workspace,
        settings: Settings,
        *,
        http_client: httpx.AsyncClient | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        retry_base_seconds: float = 1.0,
    ):
        if not workspace.vendure_channels_token:
            raise VendureAPIError("Vendure channel token is not configured")
        self.workspace_id = workspace.id
        self.graphql_url = (workspace.vendure_url or settings.vendure_url).rstrip("/")
        self.channel_token = workspace.vendure_channels_token
        self.api_key = settings.vendure_api_key
        self._http_client = http_client or httpx.AsyncClient(timeout=90)
        self._owns_client = http_client is None
        self._sleep = sleep
        self._retry_base_seconds = retry_base_seconds

    async def close(self) -> None:
        if self._owns_client:
            await self._http_client.aclose()

    async def execute(
        self,
        query: str,
        variables: dict[str, Any] | None = None,
        *,
        max_attempts: int = 4,
    ) -> dict:
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        headers = {
            "vendure-token": self.channel_token,
            "Accept": "application/json",
        }
        if self.api_key:
            headers["vendure-api-key"] = self.api_key
        last_error: VendureAPIError | None = None
        for attempt in range(max_attempts):
            try:
                response = await self._http_client.post(
                    self.graphql_url,
                    headers=headers,
                    json={"query": query, "variables": variables or {}},
                )
            except httpx.RequestError as exc:
                last_error = VendureAPIError(
                    "Vendure GraphQL network request failed",
                    retryable=True,
                )
                if attempt < max_attempts - 1:
                    await self._sleep(self._retry_base_seconds * (2**attempt))
                    continue
                raise last_error from exc
            if response.status_code in self.RETRYABLE_STATUS_CODES:
                last_error = VendureAPIError(
                    "Vendure GraphQL request is temporarily unavailable",
                    status_code=response.status_code,
                    retryable=True,
                )
                if attempt < max_attempts - 1:
                    retry_after = response.headers.get("Retry-After")
                    try:
                        delay = float(retry_after) if retry_after else self._retry_base_seconds * (2**attempt)
                    except ValueError:
                        delay = self._retry_base_seconds * (2**attempt)
                    await self._sleep(max(0.0, delay))
                    continue
                raise last_error
            if response.status_code >= 400:
                raise VendureAPIError(
                    "Vendure GraphQL request failed",
                    status_code=response.status_code,
                )
            try:
                body = response.json()
            except ValueError as exc:
                raise VendureAPIError("Vendure GraphQL response is not valid JSON") from exc
            errors = body.get("errors") or []
            if errors:
                raise VendureGraphQLError(
                    "Vendure GraphQL returned errors",
                    errors=list(errors),
                )
            data = body.get("data")
            if not isinstance(data, dict):
                raise VendureAPIError("Vendure GraphQL response did not include data")
            user_errors = _find_user_errors(data)
            if user_errors:
                raise VendureGraphQLError(
                    "Vendure mutation returned user errors",
                    errors=user_errors,
                )
            return data
        if last_error is not None:
            raise last_error
        raise VendureAPIError("Vendure GraphQL request failed")


def _find_user_errors(value: Any) -> list[dict]:
    if isinstance(value, dict):
        found = []
        for key, child in value.items():
            if key in {"userErrors", "errors"} and isinstance(child, list):
                found.extend(item for item in child if isinstance(item, dict) and item)
            else:
                found.extend(_find_user_errors(child))
        return found
    if isinstance(value, list):
        found = []
        for child in value:
            found.extend(_find_user_errors(child))
        return found
    return []
