from collections import defaultdict

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app.main import create_app

EXERCISED_OPERATIONS: dict[str, set[tuple[str, str]]] = defaultdict(set)
COLLECTED_TESTS: set[str] = set()


def _registered_operations(routes, prefix: str = ""):
    for route in routes:
        original_router = getattr(route, "original_router", None)
        include_context = getattr(route, "include_context", None)
        if original_router is not None and include_context is not None:
            nested_prefix = include_context.prefix or prefix
            yield from _registered_operations(original_router.routes, nested_prefix)
            continue
        endpoint = getattr(route, "endpoint", None)
        methods = getattr(route, "methods", None)
        route_path = getattr(route, "path", None)
        if endpoint is None or methods is None or route_path is None:
            continue
        for method in methods:
            yield (method.upper(), endpoint), (method.upper(), f"{prefix}{route_path}")


def pytest_collection_modifyitems(items):
    COLLECTED_TESTS.update(item.name for item in items)
    gate_name = "test_django_route_operations_are_exercised_by_registered_tests"
    regular = [item for item in items if item.name != gate_name]
    gates = [item for item in items if item.name == gate_name]
    items[:] = regular + gates


@pytest.fixture
def client(request):
    application = create_app(
        database_url="sqlite+aiosqlite:///:memory:",
        auto_create_schema=True,
        auto_seed=True,
    )
    operation_by_endpoint = dict(_registered_operations(application.routes))

    @application.middleware("http")
    async def track_exercised_operation(http_request: Request, call_next):
        response = await call_next(http_request)
        operation = operation_by_endpoint.get(
            (http_request.method.upper(), http_request.scope.get("endpoint"))
        )
        if operation:
            EXERCISED_OPERATIONS[request.node.name].add(operation)
        return response

    with TestClient(application) as test_client:
        yield test_client


@pytest.fixture
def newlife_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "newlife", "password": "Mekyro123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.fixture
def ops_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "ops", "password": "Mekyro123!"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
