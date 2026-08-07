from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MEKYRO_",
        extra="ignore",
    )

    app_name: str = "Mekyro API"
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./data/mekyro_fake.db"
    jwt_secret: str = "development-secret-change-before-production-2026"
    credential_encryption_key: str = ""
    access_token_minutes: int = 60
    challenge_expires_minutes: int = 5
    challenge_target_interval_seconds: int = 60
    challenge_ip_hourly_limit: int = 10
    challenge_target_daily_limit: int = 10
    challenge_max_attempts: int = 5
    challenge_debug_codes: bool = True
    challenge_gateway_mode: str = "development"
    trusted_proxy_cidrs: str = ""
    alibaba_cloud_access_key_id: str = ""
    alibaba_cloud_access_key_secret: str = ""
    captcha_app_secret_key: str = ""
    sms_sign_name: str = ""
    sms_template_code: str = ""
    smtp_host: str = "smtp.163.com"
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_secure: bool = True
    auto_create_schema: bool = True
    auto_seed: bool = True
    upload_directory: str = "./data/uploads"
    max_upload_bytes: int = 10 * 1024 * 1024
    public_inquiry_rate_limit_per_minute: int = 60
    agent_api_key: str = ""
    agent_base_url: str = "https://api.deepseek.com"
    agent_model: str = "deepseek-chat"
    agent_timeout_seconds: float = 30


@lru_cache
def get_settings() -> Settings:
    return Settings()
