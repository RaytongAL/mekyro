from fastapi.testclient import TestClient


def test_public_inquiry_rate_limit_returns_retry_contract(client: TestClient):
    client.app.state.public_inquiry_limiter.limit = 1
    payload = {
        "company_name": "Rate Limited Buyer",
        "required_product": "Bulk lamps",
        "country": "US",
        "contact_name": "Test User",
        "phone": "+12025550100",
        "email": "rate-limit@example.com",
    }
    first = client.post("/api/v1/inquiries/buyers", json=payload)
    assert first.status_code == 201
    second = client.post("/api/v1/inquiries/buyers", json=payload)
    assert second.status_code == 429
    assert second.headers["Retry-After"]
    assert second.headers["X-RateLimit-Limit"] == "1"
