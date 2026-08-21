from datetime import UTC, datetime, timedelta, timezone

from sqlalchemy.dialects import mysql

from app.core.types import UTCDateTime


def test_utc_datetime_normalizes_values_for_mysql_storage_and_api_serialization():
    column_type = UTCDateTime()
    dialect = mysql.dialect()
    china_time = datetime(2026, 8, 21, 16, 7, 56, tzinfo=timezone(timedelta(hours=8)))

    stored = column_type.process_bind_param(china_time, dialect)
    assert stored == datetime(2026, 8, 21, 8, 7, 56)
    assert stored.tzinfo is None

    restored = column_type.process_result_value(stored, dialect)
    assert restored == datetime(2026, 8, 21, 8, 7, 56, tzinfo=UTC)
    assert restored.isoformat().endswith("+00:00")
