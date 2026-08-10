import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import Settings
from app.core.models import ShopifyConfig
from app.core.secrets import decrypt_secret


class ShopifyAPIError(RuntimeError):
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


class ShopifyAuthError(ShopifyAPIError):
    pass


class ShopifyGraphQLError(ShopifyAPIError):
    pass


_token_cache: dict[str, tuple[str, datetime]] = {}
_location_cache: dict[str, str] = {}


def clear_shopify_caches(workspace_id: str | None = None) -> None:
    if workspace_id is None:
        _token_cache.clear()
        _location_cache.clear()
        return
    _token_cache.pop(workspace_id, None)
    _location_cache.pop(workspace_id, None)


class ShopifyClient:
    TOKEN_PATH = "/admin/oauth/access_token"
    RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})

    def __init__(
        self,
        config: ShopifyConfig,
        settings: Settings,
        *,
        http_client: httpx.AsyncClient | None = None,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        retry_base_seconds: float = 1.0,
    ):
        if not config.is_ready:
            raise ShopifyAPIError("Shopify configuration is disabled or incomplete")
        self.workspace_id = config.workspace_id
        self.store_url = config.store_url.rstrip("/")
        self.api_version = config.api_version
        self.api_key = decrypt_secret(config.api_key_encrypted, settings)
        self.api_secret = decrypt_secret(config.api_secret_encrypted, settings)
        self.grant_type = config.grant_type
        self._http_client = http_client or httpx.AsyncClient(timeout=30)
        self._owns_client = http_client is None
        self._sleep = sleep
        self._retry_base_seconds = retry_base_seconds

    @property
    def graphql_url(self) -> str:
        return f"{self.store_url}/admin/api/{self.api_version}/graphql.json"

    async def close(self) -> None:
        if self._owns_client:
            await self._http_client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _traceback):
        await self.close()

    async def get_access_token(self, *, force_refresh: bool = False) -> str:
        now = datetime.now(UTC)
        cached = _token_cache.get(self.workspace_id)
        if not force_refresh and cached and now < cached[1] - timedelta(minutes=5):
            return cached[0]
        return await self._refresh_access_token()

    async def _refresh_access_token(self) -> str:
        try:
            response = await self._http_client.post(
                f"{self.store_url}{self.TOKEN_PATH}",
                json={
                    "client_id": self.api_key,
                    "client_secret": self.api_secret,
                    "grant_type": self.grant_type,
                },
            )
        except httpx.RequestError as exc:
            raise ShopifyAPIError(
                "Shopify token request failed",
                retryable=True,
            ) from exc
        if response.status_code >= 400:
            raise ShopifyAuthError(
                "Shopify token request was rejected",
                status_code=response.status_code,
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise ShopifyAuthError("Shopify token response is not valid JSON") from exc
        token = body.get("access_token")
        if not isinstance(token, str) or not token:
            raise ShopifyAuthError("Shopify token response did not include access_token")
        expires_in = body.get("expires_in", 86400)
        try:
            lifetime = max(60, int(expires_in))
        except (TypeError, ValueError):
            lifetime = 86400
        _token_cache[self.workspace_id] = (token, datetime.now(UTC) + timedelta(seconds=lifetime))
        return token

    async def execute(
        self,
        query: str,
        variables: dict[str, Any] | None = None,
        *,
        max_attempts: int = 3,
    ) -> dict:
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        auth_retried = False
        last_error: ShopifyAPIError | None = None
        for attempt in range(max_attempts):
            token = await self.get_access_token(force_refresh=auth_retried)
            auth_retried = False
            try:
                response = await self._http_client.post(
                    self.graphql_url,
                    headers={
                        "X-Shopify-Access-Token": token,
                        "Accept": "application/json",
                    },
                    json={"query": query, "variables": variables or {}},
                )
            except httpx.RequestError as exc:
                last_error = ShopifyAPIError(
                    "Shopify GraphQL network request failed",
                    retryable=True,
                )
                if attempt < max_attempts - 1:
                    await self._sleep(self._retry_delay(attempt, None))
                    continue
                raise last_error from exc

            if response.status_code == 401:
                clear_shopify_caches(self.workspace_id)
                if attempt < max_attempts - 1:
                    auth_retried = True
                    continue
                raise ShopifyAuthError("Shopify GraphQL authentication failed", status_code=401)
            if response.status_code in self.RETRYABLE_STATUS_CODES:
                last_error = ShopifyAPIError(
                    "Shopify GraphQL request is temporarily unavailable",
                    status_code=response.status_code,
                    retryable=True,
                )
                if attempt < max_attempts - 1:
                    await self._sleep(self._retry_delay(attempt, response))
                    continue
                raise last_error
            if response.status_code >= 400:
                raise ShopifyAPIError(
                    "Shopify GraphQL request failed",
                    status_code=response.status_code,
                )
            try:
                body = response.json()
            except ValueError as exc:
                raise ShopifyAPIError("Shopify GraphQL response is not valid JSON") from exc
            errors = body.get("errors") or []
            if errors:
                raise ShopifyGraphQLError(
                    "Shopify GraphQL returned errors",
                    errors=list(errors),
                )
            data = body.get("data")
            if not isinstance(data, dict):
                raise ShopifyAPIError("Shopify GraphQL response did not include data")
            user_errors = _find_user_errors(data)
            if user_errors:
                raise ShopifyGraphQLError(
                    "Shopify mutation returned user errors",
                    errors=user_errors,
                )
            return data
        if last_error is not None:
            raise last_error
        raise ShopifyAPIError("Shopify GraphQL request failed")

    def _retry_delay(self, attempt: int, response: httpx.Response | None) -> float:
        if response is not None:
            retry_after = response.headers.get("Retry-After")
            if retry_after:
                try:
                    return max(0.0, float(retry_after))
                except ValueError:
                    pass
        return self._retry_base_seconds * (2**attempt)

    async def get_location_id(self) -> str:
        cached = _location_cache.get(self.workspace_id)
        if cached:
            return cached
        data = await self.execute(
            """
            query MekyroLocations {
              locations(first: 10) { edges { node { id name isActive } } }
            }
            """
        )
        edges = data.get("locations", {}).get("edges", [])
        for edge in edges:
            node = edge.get("node") or {}
            if node.get("isActive") and node.get("id"):
                location_id = str(node["id"])
                _location_cache[self.workspace_id] = location_id
                return location_id
        raise ShopifyAPIError("No active Shopify location was found")


def _find_user_errors(value: Any) -> list[dict]:
    if isinstance(value, dict):
        found: list[dict] = []
        for key, child in value.items():
            if key == "userErrors" and isinstance(child, list):
                found.extend(item for item in child if isinstance(item, dict))
            else:
                found.extend(_find_user_errors(child))
        return found
    if isinstance(value, list):
        found = []
        for child in value:
            found.extend(_find_user_errors(child))
        return found
    return []
