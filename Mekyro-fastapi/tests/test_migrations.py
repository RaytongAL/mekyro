import os
import sqlite3
import subprocess
from pathlib import Path

from app.core.models import Base

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ALEMBIC = PROJECT_ROOT / ".venv" / "bin" / "alembic"


def _run_alembic(database_path: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["MEKYRO_DATABASE_URL"] = f"sqlite+aiosqlite:///{database_path}"
    return subprocess.run(
        [str(ALEMBIC), *arguments],
        cwd=PROJECT_ROOT,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )


def _table_names(database_path: Path) -> set[str]:
    with sqlite3.connect(database_path) as connection:
        return {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        }


def test_alembic_upgrades_empty_database_to_all_models_without_schema_drift(tmp_path: Path):
    database_path = tmp_path / "migration.db"
    _run_alembic(database_path, "upgrade", "head")

    expected_tables = set(Base.metadata.tables) | {"alembic_version"}
    assert _table_names(database_path) == expected_tables
    current = _run_alembic(database_path, "current")
    assert "0003_workspace_email_outreach (head)" in current.stdout
    drift = _run_alembic(database_path, "check")
    assert "No new upgrade operations detected" in drift.stdout


def test_alembic_initial_schema_downgrades_cleanly(tmp_path: Path):
    database_path = tmp_path / "migration-downgrade.db"
    _run_alembic(database_path, "upgrade", "head")
    _run_alembic(database_path, "downgrade", "base")

    assert _table_names(database_path) == {"alembic_version"}
