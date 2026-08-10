from fastapi.testclient import TestClient


def test_request_correlation_id_is_preserved_and_metrics_are_recorded(client: TestClient):
    response = client.get("/api/v1/health", headers={"X-Request-ID": "test-correlation-01"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "test-correlation-01"

    metrics = client.get("/api/v1/metrics")
    assert metrics.status_code == 200
    entries = metrics.json()["requests"]
    assert any(
        item["method"] == "GET"
        and item["path"] == "/health"
        and item["status_code"] == 200
        and item["count"] >= 1
        for item in entries
    )


def test_invalid_request_id_is_replaced(client: TestClient):
    response = client.get("/api/v1/health", headers={"X-Request-ID": "bad id"})
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] != "bad id"
    assert len(response.headers["X-Request-ID"]) == 36
