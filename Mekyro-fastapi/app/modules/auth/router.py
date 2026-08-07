from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.audit import record_audit
from app.core.config import Settings, get_settings
from app.core.dependencies import CurrentUser, SessionDep
from app.core.models import User, Workspace, WorkspaceMember
from app.core.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["authentication"])


class LoginRequest(BaseModel):
    username: str
    password: str
    vendor_only: bool = False


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    email: str
    display_name: str
    nickname: str
    country_code: str
    phone: str
    avatar: str
    language: str
    is_platform_admin: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=150)
    nickname: str | None = Field(default=None, min_length=1, max_length=150)
    country_code: str | None = Field(default=None, min_length=1, max_length=10)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(
        default=None,
        min_length=5,
        max_length=254,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    )
    avatar: str | None = Field(default=None, max_length=500)


class UserLanguageRequest(BaseModel):
    language: str = Field(pattern=r"^(zh-CN|en-US)$")


async def has_active_workspace_membership(user_id: str, session: SessionDep) -> bool:
    membership = await session.scalar(
        select(WorkspaceMember.id)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(
            WorkspaceMember.user_id == user_id,
            Workspace.is_active.is_(True),
        )
        .limit(1)
    )
    return membership is not None


async def _find_password_user(login_id: str, session: SessionDep) -> User | None:
    normalized = login_id.strip()
    if not normalized:
        return None

    user = await session.scalar(select(User).where(User.username == normalized))
    if user is not None:
        return user

    user = await session.scalar(select(User).where(func.lower(User.email) == normalized.lower()))
    if user is not None:
        return user

    phone = normalized.replace(" ", "").replace("-", "")
    if phone.startswith("+"):
        phone = phone[1:]
    return await session.scalar(select(User).where(User.phone == phone).limit(1))


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> TokenResponse:
    user = await _find_password_user(payload.username, session)
    if (
        user is None
        or not user.is_active
        or not verify_password(payload.password, user.password_hash)
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    has_active_workspace = await has_active_workspace_membership(user.id, session)
    if not user.is_platform_admin and not has_active_workspace:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active Workspace membership",
        )
    if payload.vendor_only and not has_active_workspace:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vendor Workspace required",
        )
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


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserResponse:
    return UserResponse.model_validate(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: UserProfileUpdateRequest,
    user: CurrentUser,
    session: SessionDep,
) -> User:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="No fields to update"
        )
    if "email" in changes:
        changes["email"] = changes["email"].strip().lower()
        duplicate = await session.scalar(
            select(User.id).where(User.email == changes["email"], User.id != user.id)
        )
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    for field_name, value in changes.items():
        setattr(user, field_name, value)
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=user.id,
        action="user.profile_updated",
        entity_type="user",
        entity_id=user.id,
        payload={"fields": sorted(changes)},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already exists"
        ) from exc
    return user


@router.put("/me/language", response_model=dict[str, str])
async def update_language(
    payload: UserLanguageRequest,
    user: CurrentUser,
    session: SessionDep,
) -> dict[str, str]:
    user.language = payload.language
    record_audit(
        session,
        workspace_id=None,
        actor_user_id=user.id,
        action="user.language_updated",
        entity_type="user",
        entity_id=user.id,
        payload={"language": user.language},
    )
    await session.commit()
    return {"language": user.language}
