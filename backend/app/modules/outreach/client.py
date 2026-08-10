from typing import Any

import httpx

from app.core.config import Settings


class EmailOutreachError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 0):
        super().__init__(message)
        self.status_code = status_code


class EmailOutreachClient:
    def __init__(
        self,
        settings: Settings,
        *,
        http_client: httpx.AsyncClient | None = None,
    ):
        if not settings.email_outreach_api_key:
            raise EmailOutreachError("Email outreach API key is not configured")
        self.api_url = settings.email_outreach_api_url
        self.api_key = settings.email_outreach_api_key
        self.idempotency_prefix = settings.email_outreach_idempotency_key_prefix
        self._http_client = http_client or httpx.AsyncClient(timeout=30)
        self._owns_client = http_client is None

    async def close(self) -> None:
        if self._owns_client:
            await self._http_client.aclose()

    async def trigger(
        self,
        *,
        lead_id: str,
        workspace_id: str,
        allow_repeat: bool = True,
    ) -> dict[str, Any]:
        try:
            response = await self._http_client.post(
                self.api_url,
                headers={
                    "X-API-Key": self.api_key,
                    "X-Mekyro-Workspace-ID": workspace_id,
                    "Idempotency-Key": f"{self.idempotency_prefix}-lead-{lead_id}",
                },
                json={"lead_id": lead_id, "allow_repeat": allow_repeat},
            )
        except httpx.RequestError as exc:
            raise EmailOutreachError("Email outreach network request failed") from exc
        if response.status_code >= 400:
            raise EmailOutreachError(
                "Email outreach request failed",
                status_code=response.status_code,
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise EmailOutreachError("Email outreach response is not valid JSON") from exc
        if not isinstance(body, dict):
            raise EmailOutreachError("Email outreach response is not an object")
        return body
