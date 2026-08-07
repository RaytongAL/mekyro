from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import get_settings
from app.core.database import Database
from app.core.observability import RequestMetrics, observe_request
from app.core.rate_limit import FixedWindowRateLimiter, enforce_public_rate_limit
from app.modules.agent.gateway import DeterministicModelGateway, OpenAICompatibleModelGateway
from app.modules.auth.challenge_gateway import (
    AliyunSmtpChallengeGateway,
    DevelopmentChallengeGateway,
)


def create_app(
    *,
    database_url: str | None = None,
    auto_create_schema: bool | None = None,
    auto_seed: bool | None = None,
) -> FastAPI:
    settings = get_settings()
    database = Database(database_url or settings.database_url)
    should_create = (
        settings.auto_create_schema if auto_create_schema is None else auto_create_schema
    )
    should_seed = settings.auto_seed if auto_seed is None else auto_seed

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if should_create:
            await database.create_schema()
        if should_seed:
            from app.scripts.seed_fake_db import seed_database

            await seed_database(database)
        yield
        close_gateway = getattr(app.state.challenge_gateway, "close", None)
        if close_gateway is not None:
            await close_gateway()
        await database.dispose()

    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="FastAPI-native Mekyro functional rebuild",
        lifespan=lifespan,
    )
    application.state.database = database
    application.state.settings = settings
    application.state.request_metrics = RequestMetrics()
    application.state.public_inquiry_limiter = FixedWindowRateLimiter(
        settings.public_inquiry_rate_limit_per_minute
    )
    application.middleware("http")(enforce_public_rate_limit)
    application.middleware("http")(observe_request)
    upload_directory = Path(settings.upload_directory)
    upload_directory.mkdir(parents=True, exist_ok=True)
    application.state.upload_directory = upload_directory
    application.state.max_upload_bytes = settings.max_upload_bytes
    application.state.challenge_gateway = (
        AliyunSmtpChallengeGateway(settings)
        if settings.challenge_gateway_mode == "aliyun_smtp"
        else DevelopmentChallengeGateway()
    )
    application.state.agent_gateway = (
        OpenAICompatibleModelGateway(
            api_key=settings.agent_api_key,
            base_url=settings.agent_base_url,
            model=settings.agent_model,
            timeout_seconds=settings.agent_timeout_seconds,
        )
        if settings.agent_api_key
        else DeterministicModelGateway()
    )
    application.mount("/media", StaticFiles(directory=upload_directory), name="media")
    application.include_router(api_router)
    return application


app = create_app()
