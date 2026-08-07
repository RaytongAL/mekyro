import ast
import json
import re
from collections import Counter
from pathlib import Path

import pytest

from app.main import create_app
from tests.conftest import COLLECTED_TESTS, EXERCISED_OPERATIONS

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = PROJECT_ROOT / "docs" / "django-route-contract.json"
PARITY_PATH = PROJECT_ROOT / "docs" / "django-feature-parity.md"
REGISTRY_PATH = PROJECT_ROOT / "docs" / "feature-test-registry.md"
DJANGO_APPS_ROOT = PROJECT_ROOT.parent / "Mekyro-main" / "backend" / "apps"
DJANGO_CONFIG_URLS = PROJECT_ROOT.parent / "Mekyro-main" / "backend" / "config" / "urls.py"
HTTP_HANDLER_METHODS = {"get", "post", "put", "patch", "delete"}


def _test_function_names() -> set[str]:
    names: set[str] = set()
    for path in (PROJECT_ROOT / "tests").glob("test_*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        names.update(
            node.name
            for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name.startswith("test_")
        )
    return names


def _django_named_routes(source_files: list[str]) -> set[str]:
    names: list[str] = []
    for relative_path in source_files:
        source = (DJANGO_APPS_ROOT / relative_path).read_text(encoding="utf-8")
        names.extend(re.findall(r'name\s*=\s*["\']([^"\']+)["\']', source))
    assert len(names) == len(set(names)), "Django named routes must remain unique"
    return set(names)


def _django_active_url_files() -> set[str]:
    tree = ast.parse(
        DJANGO_CONFIG_URLS.read_text(encoding="utf-8"),
        filename=str(DJANGO_CONFIG_URLS),
    )
    modules: set[str] = set()
    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "include"
            and node.args
            and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)
            and node.args[0].value.startswith("apps.")
        ):
            continue
        modules.add(node.args[0].value.removeprefix("apps.").replace(".", "/") + ".py")
    return modules


def _django_named_route_operations(source_files: list[str]) -> set[tuple[str, str]]:
    classes: dict[str, tuple[set[str], list[str]]] = {}
    for path in DJANGO_APPS_ROOT.glob("*/views/*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in tree.body:
            if not isinstance(node, ast.ClassDef):
                continue
            assert node.name not in classes, f"Duplicate Django view class: {node.name}"
            methods = {
                child.name
                for child in node.body
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
                and child.name in HTTP_HANDLER_METHODS
            }
            bases = [base.id for base in node.bases if isinstance(base, ast.Name)]
            classes[node.name] = (methods, bases)

    def inherited_methods(class_name: str, seen: frozenset[str] = frozenset()) -> set[str]:
        assert class_name not in seen, f"Cyclic Django view inheritance: {class_name}"
        own_methods, bases = classes.get(class_name, (set(), []))
        methods = set(own_methods)
        for base in bases:
            methods.update(inherited_methods(base, seen | {class_name}))
        return methods

    operations: set[tuple[str, str]] = set()
    for relative_path in source_files:
        path = DJANGO_APPS_ROOT / relative_path
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "path"
                and len(node.args) >= 2
            ):
                continue
            route_name = next(
                (
                    keyword.value.value
                    for keyword in node.keywords
                    if keyword.arg == "name" and isinstance(keyword.value, ast.Constant)
                ),
                None,
            )
            view = node.args[1]
            if route_name is None:
                continue
            assert (
                isinstance(view, ast.Call)
                and isinstance(view.func, ast.Attribute)
                and view.func.attr == "as_view"
                and isinstance(view.func.value, ast.Name)
            ), f"Unsupported Django route view for {route_name}"
            class_name = view.func.value.id
            methods = inherited_methods(class_name)
            assert methods, f"No HTTP handlers resolved for Django view {class_name}"
            operations.update((route_name, method.upper()) for method in methods)
    return operations


def test_django_route_contract_covers_source_openapi_and_default_pytest():
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    mappings = contract["mappings"]
    feature_names = [item["feature"] for item in mappings]
    assert len(feature_names) == len(set(feature_names))

    mapped_routes = [route for item in mappings for route in item["django_routes"]]
    duplicates = sorted(name for name, count in Counter(mapped_routes).items() if count > 1)
    assert not duplicates, f"Django routes mapped more than once: {duplicates}"
    assert len(mapped_routes) == contract["django_named_route_count"]

    # The FastAPI project remains standalone. When the sibling legacy checkout is
    # available, this also detects any Django URL added without a parity mapping.
    if DJANGO_APPS_ROOT.exists():
        assert DJANGO_CONFIG_URLS.exists()
        assert set(contract["django_source_files"]) == _django_active_url_files()
        source_routes = _django_named_routes(contract["django_source_files"])
        assert set(mapped_routes) == source_routes
        source_operations = _django_named_route_operations(contract["django_source_files"])
        assert {route for route, _method in source_operations} == source_routes
        assert len(source_operations) == contract["django_named_route_operation_count"]
        method_gaps: dict[str, list[str]] = {}
        for item in mappings:
            django_methods = {
                method
                for route, method in source_operations
                if route in item["django_routes"]
            }
            fastapi_methods = {method.upper() for method, _path in item["fastapi"]}
            missing_methods = sorted(django_methods - fastapi_methods)
            if missing_methods:
                method_gaps[item["feature"]] = missing_methods
        assert not method_gaps, (
            "Django HTTP methods missing from mapped FastAPI feature groups: "
            f"{method_gaps}"
        )

    openapi_paths = create_app(auto_create_schema=False, auto_seed=False).openapi()["paths"]
    missing_operations = []
    for item in mappings:
        assert item["django_routes"]
        assert item["fastapi"]
        assert item["tests"]
        for method, path in item["fastapi"]:
            if path not in openapi_paths or method.lower() not in openapi_paths[path]:
                missing_operations.append(f"{item['feature']}: {method} {path}")
    assert not missing_operations, "Missing FastAPI operations: " + ", ".join(
        missing_operations
    )

    available_tests = _test_function_names()
    referenced_tests = {name for item in mappings for name in item["tests"]}
    missing_tests = sorted(referenced_tests - available_tests)
    assert not missing_tests, f"Contract references missing pytest functions: {missing_tests}"


def test_done_feature_ids_have_registered_default_pytest():
    parity = PARITY_PATH.read_text(encoding="utf-8")
    registry = REGISTRY_PATH.read_text(encoding="utf-8")
    done_ids = set(
        re.findall(r"^\| ([A-Z]+-\d+) \|.*\| Done \|$", parity, flags=re.MULTILINE)
    )
    registry_rows = re.findall(
        r"^\| ([A-Z]+-\d+) \|.*?\| (.*?) \| Implemented \|$",
        registry,
        flags=re.MULTILINE,
    )
    registered_ids = [feature_id for feature_id, _tests in registry_rows]
    duplicate_ids = sorted(
        feature_id
        for feature_id, count in Counter(registered_ids).items()
        if count > 1
    )
    assert not duplicate_ids, f"Feature IDs registered more than once: {duplicate_ids}"
    assert done_ids <= set(registered_ids), (
        "Done feature IDs missing from test registry: "
        f"{sorted(done_ids - set(registered_ids))}"
    )

    available_tests = _test_function_names()
    missing_tests: dict[str, list[str]] = {}
    for feature_id, tests_cell in registry_rows:
        referenced = re.findall(r"`(test_[a-zA-Z0-9_]+)`", tests_cell)
        if not referenced:
            missing_tests[feature_id] = ["<no test registered>"]
            continue
        absent = sorted(set(referenced) - available_tests)
        if absent:
            missing_tests[feature_id] = absent
    assert not missing_tests, f"Feature registry has missing pytest functions: {missing_tests}"


def test_django_route_operations_are_exercised_by_registered_tests():
    contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    registered_tests = {name for item in contract["mappings"] for name in item["tests"]}
    if not registered_tests <= COLLECTED_TESTS:
        pytest.skip("Operation execution gate requires the default full pytest suite")

    missing: dict[str, list[str]] = {}
    for item in contract["mappings"]:
        exercised = set().union(
            *(EXERCISED_OPERATIONS.get(test_name, set()) for test_name in item["tests"])
        )
        expected = {(method.upper(), path) for method, path in item["fastapi"]}
        absent = sorted(f"{method} {path}" for method, path in expected - exercised)
        if absent:
            missing[item["feature"]] = absent
    assert not missing, f"Registered tests did not exercise mapped operations: {missing}"
