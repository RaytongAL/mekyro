import hashlib
import hmac
import secrets
from datetime import UTC, datetime, time, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select

from app.core.audit import record_audit
from app.core.client_ip import resolve_client_ip
from app.core.config import Settings, get_settings
from app.core.dependencies import SessionDep
from app.core.models import AuthChallenge, User, new_id
from app.core.security import create_access_token
from app.modules.auth.challenge_gateway import ChallengeDeliveryError, ChallengeGateway
from app.modules.auth.router import (
    TokenResponse,
    UserResponse,
    has_active_workspace_membership,
)

router = APIRouter(prefix="/auth/challenges", tags=["authentication"])

ChallengeChannel = Literal["sms", "email"]


class ChallengeIssueRequest(BaseModel):
    channel: ChallengeChannel
    target: str = Field(min_length=3, max_length=254)
    captcha_token: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_target(self):
        self.target = _normalize_target(self.channel, self.target)
        if self.channel == "sms" and not self.captcha_token:
            raise ValueError("captcha_token is required for SMS challenges")
        return self


class ChallengeIssuedResponse(BaseModel):
    challenge_id: str
    channel: ChallengeChannel
    target_masked: str
    expires_at: datetime
    retry_after_seconds: int
    debug_code: str | None = None


class ChallengeLoginRequest(BaseModel):
    channel: ChallengeChannel
    target: str = Field(min_length=3, max_length=254)
    code: str = Field(min_length=4, max_length=6, pattern=r"^\d{4,6}$")
    vendor_only: bool = False

    @model_validator(mode="after")
    def normalize_target(self):
        self.target = _normalize_target(self.channel, self.target)
        return self


def _normalize_target(channel: str, target: str) -> str:
    normalized = target.strip()
    if channel == "email":
        normalized = normalized.lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("A valid email address is required")
    else:
        normalized = normalized.replace(" ", "").replace("-", "")
        if normalized.startswith("+"):
            normalized = normalized[1:]
        if not normalized.isdigit() or not 7 <= len(normalized) <= 20:
            raise ValueError("A valid phone number is required")
    return normalized


def _mask_target(channel: str, target: str) -> str:
    if channel == "email":
        local, domain = target.split("@", 1)
        return f"{local[:1]}***@{domain}"
    return f"{'*' * max(3, len(target) - 4)}{target[-4:]}"


def _code_hash(challenge_id: str, channel: str, target: str, code: str, secret: str) -> str:
    message = f"{challenge_id}:{channel}:{target}:{code}".encode()
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _client_ip(request: Request, settings: Settings) -> str:
    return resolve_client_ip(request, settings.trusted_proxy_cidrs)


def _gateway(request: Request) -> ChallengeGateway:
    return request.app.state.challenge_gateway


async def _find_user(channel: str, target: str, session: SessionDep) -> User | None:
    if channel == "email":
        return await session.scalar(select(User).where(func.lower(User.email) == target.lower()))
    return await session.scalar(select(User).where(User.phone == target))


async def _enforce_issue_limits(
    *,
    channel: str,
    target: str,
    ip_address: str,
    session: SessionDep,
    settings: Settings,
) -> None:
    now = datetime.now(UTC)
    recent_target = await session.scalar(
        select(func.count())
        .select_from(AuthChallenge)
        .where(
            AuthChallenge.channel == channel,
            AuthChallenge.target == target,
            AuthChallenge.created_at
            >= now - timedelta(seconds=settings.challenge_target_interval_seconds),
        )
    )
    if (recent_target or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Challenge was requested too recently",
            headers={"Retry-After": str(settings.challenge_target_interval_seconds)},
        )
    hourly_ip = await session.scalar(
        select(func.count())
        .select_from(AuthChallenge)
        .where(
            AuthChallenge.ip_address == ip_address,
            AuthChallenge.created_at >= now - timedelta(hours=1),
        )
    )
    if (hourly_ip or 0) >= settings.challenge_ip_hourly_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Challenge request limit reached for this network",
            headers={"Retry-After": "3600"},
        )
    today_start = datetime.combine(now.date(), time.min, tzinfo=UTC)
    daily_target = await session.scalar(
        select(func.count())
        .select_from(AuthChallenge)
        .where(
            AuthChallenge.channel == channel,
            AuthChallenge.target == target,
            AuthChallenge.created_at >= today_start,
        )
    )
    if (daily_target or 0) >= settings.challenge_target_daily_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily challenge request limit reached",
            headers={"Retry-After": "86400"},
        )


@router.post("", response_model=ChallengeIssuedResponse, status_code=status.HTTP_201_CREATED)
async def issue_challenge(
    payload: ChallengeIssueRequest,
    request: Request,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ChallengeIssuedResponse:
    ip_address = _client_ip(request, settings)
    gateway = _gateway(request)
    captcha_verified = False
    if payload.channel == "sms":
        try:
            captcha_verified = await gateway.verify_captcha(
                payload.captcha_token or "", ip_address
            )
        except ChallengeDeliveryError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Captcha verification is temporarily unavailable",
            ) from exc
        if not captcha_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Captcha verification failed",
            )
    user = await _find_user(payload.channel, payload.target, session)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account is not available for challenge login",
        )
    await _enforce_issue_limits(
        channel=payload.channel,
        target=payload.target,
        ip_address=ip_address,
        session=session,
        settings=settings,
    )
    challenge_id = new_id()
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = AuthChallenge(
        id=challenge_id,
        channel=payload.channel,
        target=payload.target,
        purpose="login",
        code_hash=_code_hash(
            challenge_id,
            payload.channel,
            payload.target,
            code,
            settings.jwt_secret,
        ),
        ip_address=ip_address,
        captcha_verified=captcha_verified,
        expires_at=datetime.now(UTC) + timedelta(minutes=settings.challenge_expires_minutes),
    )
    session.add(challenge)
    try:
        await gateway.send_code(payload.channel, payload.target, code)
    except ChallengeDeliveryError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Challenge delivery is temporarily unavailable",
        ) from exc
    await session.commit()
    return ChallengeIssuedResponse(
        challenge_id=challenge.id,
        channel=payload.channel,
        target_masked=_mask_target(payload.channel, payload.target),
        expires_at=challenge.expires_at,
        retry_after_seconds=settings.challenge_target_interval_seconds,
        debug_code=(
            code
            if settings.challenge_debug_codes and settings.environment != "production"
            else None
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def challenge_login(
    payload: ChallengeLoginRequest,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    now = datetime.now(UTC)
    challenge = await session.scalar(
        select(AuthChallenge)
        .where(
            AuthChallenge.channel == payload.channel,
            AuthChallenge.target == payload.target,
            AuthChallenge.purpose == "login",
            AuthChallenge.used_at.is_(None),
            AuthChallenge.expires_at > now,
            AuthChallenge.failed_attempts < settings.challenge_max_attempts,
        )
        .order_by(AuthChallenge.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    if challenge is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Challenge code is invalid or expired",
        )
    expected = _code_hash(
        challenge.id,
        challenge.channel,
        challenge.target,
        payload.code,
        settings.jwt_secret,
    )
    if not hmac.compare_digest(expected, challenge.code_hash):
        challenge.failed_attempts += 1
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Challenge code is invalid or expired",
        )
    user = await _find_user(payload.channel, payload.target, session)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    challenge.used_at = now
    if payload.vendor_only:
        if not await has_active_workspace_membership(user.id, session):
            await session.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Vendor Workspace required",
            )
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=user.id,
        action="auth.challenge_login",
        entity_type="user",
        entity_id=user.id,
        payload={"channel": payload.channel, "vendor_only": payload.vendor_only},
    )
    await session.commit()
    return TokenResponse(
        access_token=create_access_token(
            user.id,
            settings,
            username=user.username,
            nickname=user.nickname,
            is_platform_admin=user.is_platform_admin,
        ),
        user=UserResponse.model_validate(user),
    )
