import asyncio
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.core.models import AuthChallenge, new_id
from tests.conftest import auth_header

NEWLIFE_EMAIL = "owner@newlife.example"
OPS_EMAIL = "ops@mekyro.local"
NEWLIFE_PHONE = "8613800138000"


def _issue_email(client: TestClient, target: str = NEWLIFE_EMAIL):
    response = client.post(
        "/api/v1/auth/challenges",
        json={"channel": "email", "target": target},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_email_challenge_login_is_hashed_one_time_and_issues_jwt(client: TestClient):
    issued = _issue_email(client)
    assert issued["target_masked"] == "o***@newlife.example"
    assert len(issued["debug_code"]) == 6

    async def read_challenge():
        async with client.app.state.database.sessions() as session:
            return await session.get(AuthChallenge, issued["challenge_id"])

    stored = asyncio.run(read_challenge())
    assert stored is not None
    assert stored.code_hash != issued["debug_code"]
    assert len(stored.code_hash) == 64

    login = client.post(
        "/api/v1/auth/challenges/login",
        json={
            "channel": "email",
            "target": NEWLIFE_EMAIL.upper(),
            "code": issued["debug_code"],
        },
    )
    assert login.status_code == 200, login.text
    assert login.json()["user"]["username"] == "newlife"
    assert (
        client.get(
            "/api/v1/auth/me",
            headers=auth_header(login.json()["access_token"]),
        ).status_code
        == 200
    )
    replay = client.post(
        "/api/v1/auth/challenges/login",
        json={
            "channel": "email",
            "target": NEWLIFE_EMAIL,
            "code": issued["debug_code"],
        },
    )
    assert replay.status_code == 401


def test_sms_challenge_requires_captcha_and_supports_vendor_login(
    client: TestClient,
    newlife_token: str,
):
    profile = client.patch(
        "/api/v1/auth/me",
        headers=auth_header(newlife_token),
        json={"phone": NEWLIFE_PHONE},
    )
    assert profile.status_code == 200
    missing = client.post(
        "/api/v1/auth/challenges",
        json={"channel": "sms", "target": NEWLIFE_PHONE},
    )
    assert missing.status_code == 422
    invalid = client.post(
        "/api/v1/auth/challenges",
        json={
            "channel": "sms",
            "target": NEWLIFE_PHONE,
            "captcha_token": "bad-captcha",
        },
    )
    assert invalid.status_code == 400
    issued = client.post(
        "/api/v1/auth/challenges",
        json={
            "channel": "sms",
            "target": f"+{NEWLIFE_PHONE}",
            "captcha_token": "dev-captcha-pass",
        },
    )
    assert issued.status_code == 201, issued.text
    login = client.post(
        "/api/v1/auth/challenges/login",
        json={
            "channel": "sms",
            "target": NEWLIFE_PHONE,
            "code": issued.json()["debug_code"],
            "vendor_only": True,
        },
    )
    assert login.status_code == 200
    assert login.json()["user"]["username"] == "newlife"


def test_challenge_issue_interval_and_attempt_lockout(client: TestClient):
    issued = _issue_email(client)
    too_fast = client.post(
        "/api/v1/auth/challenges",
        json={"channel": "email", "target": NEWLIFE_EMAIL},
    )
    assert too_fast.status_code == 429
    assert too_fast.headers["Retry-After"] == "60"
    for _ in range(5):
        rejected = client.post(
            "/api/v1/auth/challenges/login",
            json={"channel": "email", "target": NEWLIFE_EMAIL, "code": "000000"},
        )
        assert rejected.status_code == 401
    locked = client.post(
        "/api/v1/auth/challenges/login",
        json={
            "channel": "email",
            "target": NEWLIFE_EMAIL,
            "code": issued["debug_code"],
        },
    )
    assert locked.status_code == 401


def test_vendor_challenge_login_rejects_user_without_workspace(client: TestClient):
    issued = _issue_email(client, OPS_EMAIL)
    forbidden = client.post(
        "/api/v1/auth/challenges/login",
        json={
            "channel": "email",
            "target": OPS_EMAIL,
            "code": issued["debug_code"],
            "vendor_only": True,
        },
    )
    assert forbidden.status_code == 403
    replay = client.post(
        "/api/v1/auth/challenges/login",
        json={
            "channel": "email",
            "target": OPS_EMAIL,
            "code": issued["debug_code"],
            "vendor_only": False,
        },
    )
    assert replay.status_code == 401


def test_challenge_ip_hourly_limit_uses_persisted_fake_database(client: TestClient):
    async def seed_ip_limit():
        async with client.app.state.database.sessions() as session:
            now = datetime.now(UTC) - timedelta(minutes=2)
            session.add_all(
                [
                    AuthChallenge(
                        id=new_id(),
                        channel="email",
                        target=f"seed-{index}@example.com",
                        purpose="login",
                        code_hash="0" * 64,
                        ip_address="testclient",
                        expires_at=now + timedelta(minutes=5),
                        created_at=now,
                    )
                    for index in range(10)
                ]
            )
            await session.commit()

    asyncio.run(seed_ip_limit())
    response = client.post(
        "/api/v1/auth/challenges",
        json={"channel": "email", "target": NEWLIFE_EMAIL},
    )
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "3600"


def test_challenge_target_daily_limit_and_expiry(client: TestClient):
    async def seed_daily_limit():
        async with client.app.state.database.sessions() as session:
            now = datetime.now(UTC) - timedelta(minutes=2)
            session.add_all(
                [
                    AuthChallenge(
                        id=new_id(),
                        channel="email",
                        target=NEWLIFE_EMAIL,
                        purpose="login",
                        code_hash="0" * 64,
                        ip_address=f"10.0.0.{index}",
                        expires_at=now + timedelta(minutes=5),
                        created_at=now,
                    )
                    for index in range(10)
                ]
            )
            await session.commit()

    asyncio.run(seed_daily_limit())
    response = client.post(
        "/api/v1/auth/challenges",
        json={"channel": "email", "target": NEWLIFE_EMAIL},
    )
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "86400"


def test_expired_challenge_is_rejected(client: TestClient):
    issued = _issue_email(client)

    async def expire_challenge():
        async with client.app.state.database.sessions() as session:
            challenge = await session.get(AuthChallenge, issued["challenge_id"])
            challenge.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            await session.commit()

    asyncio.run(expire_challenge())
    response = client.post(
        "/api/v1/auth/challenges/login",
        json={
            "channel": "email",
            "target": NEWLIFE_EMAIL,
            "code": issued["debug_code"],
        },
    )
    assert response.status_code == 401
