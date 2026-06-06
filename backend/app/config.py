from functools import lru_cache

from pydantic import AnyUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Application ---
    app_env: str = "development"
    app_name: str = "Japan Job Support API"
    app_version: str = "0.1.0"
    debug: bool = False
    log_level: str = "INFO"

    # --- API Server ---
    host: str = "0.0.0.0"
    port: int = 8000
    allowed_origins: str = "http://localhost:3000"
    allowed_hosts: str = "localhost,127.0.0.1"

    # --- Database ---
    database_url: str
    database_sync_url: str
    database_pool_size: int = 10
    database_max_overflow: int = 20

    # --- Redis ---
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # --- Clerk Authentication ---
    clerk_secret_key: str
    clerk_webhook_secret: str
    clerk_jwks_url: str

    # --- Gemini (primary AI provider) ---
    gemini_api_key: str
    gemini_default_model: str = "gemini-1.5-flash"

    # --- Anthropic (optional fallback) ---
    anthropic_api_key: str = ""
    anthropic_default_model: str = "claude-sonnet-4-6"
    anthropic_max_retries: int = 3

    # --- AI Fallback ---
    openai_api_key: str = ""
    openai_fallback_model: str = "gpt-4o-mini"
    ai_fallback_enabled: bool = False

    # --- AWS S3 ---
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str = "ap-northeast-1"
    s3_bucket_name: str
    s3_presigned_url_expiry_seconds: int = 900

    # --- Stripe ---
    stripe_secret_key: str
    stripe_webhook_secret: str
    stripe_price_id_basic: str = ""
    stripe_price_id_pro: str = ""
    stripe_success_url: str = "http://localhost:3000/billing?session=success"
    stripe_cancel_url: str = "http://localhost:3000/billing?session=cancel"

    # --- Email ---
    resend_api_key: str = ""
    email_from_address: str = "noreply@example.com"
    email_from_name: str = "Japan Job Support"

    # --- Sentry ---
    sentry_dsn: str = ""
    sentry_environment: str = "development"
    sentry_traces_sample_rate: float = 0.1

    # --- Rate Limiting ---
    rate_limit_resume_upload_per_hour: int = 5
    rate_limit_ai_features_per_hour_free: int = 20
    rate_limit_job_translate_per_hour: int = 10
    rate_limit_global_per_ip_per_minute: int = 60

    # --- PDF ---
    pdf_font_path: str = "/usr/share/fonts/noto"
    job_translation_cache_days: int = 7

    # --- Derived ---
    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.allowed_hosts.split(",")]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_test(self) -> bool:
        return self.app_env == "test"

    @field_validator("database_url")
    @classmethod
    def validate_async_url(cls, v: str) -> str:
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError("DATABASE_URL must use postgresql+asyncpg:// scheme")
        return v

    @field_validator("database_sync_url")
    @classmethod
    def validate_sync_url(cls, v: str) -> str:
        if not v.startswith("postgresql+psycopg2://") and not v.startswith("postgresql://"):
            raise ValueError("DATABASE_SYNC_URL must use postgresql+psycopg2:// or postgresql:// scheme")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]


settings = get_settings()
