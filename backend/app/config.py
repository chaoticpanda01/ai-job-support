from functools import lru_cache

from pydantic import field_validator
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

    # Explicit opt-in for /docs, /redoc, /openapi.json. Defaults to false
    # everywhere — deliberately NOT inferred from app_env, so a misconfigured
    # or forgotten APP_ENV in some deployed environment can't silently expose
    # the API schema. Set ENABLE_DOCS=true in your local .env for dev.
    enable_docs: bool = False

    # --- API Server ---
    host: str = "0.0.0.0"  # noqa: S104 — must bind all interfaces inside the container
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
    clerk_webhook_secret: str = ""
    clerk_jwks_url: str
    # Optional defense-in-depth: comma-separated list of allowed `azp`
    # (authorized-party) claim values. Empty = azp is not checked (default,
    # correct for a single Clerk application). Set it to your frontend
    # origin(s) to reject tokens minted for a different app on the same
    # Clerk instance. See middleware/clerk_auth.py.
    clerk_authorized_parties: str = ""

    # --- Gemini (primary AI provider) ---
    gemini_api_key: str
    gemini_default_model: str = "gemini-2.5-flash"

    # --- Anthropic (optional fallback) ---
    anthropic_api_key: str = ""
    anthropic_default_model: str = "claude-sonnet-4-6"
    anthropic_max_retries: int = 3

    # --- AI Fallback ---
    openai_api_key: str = ""
    openai_fallback_model: str = "gpt-4o-mini"
    ai_fallback_enabled: bool = False

    # --- AWS S3 / Backblaze B2 ---
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str = "ap-northeast-1"
    s3_bucket_name: str
    s3_presigned_url_expiry_seconds: int = 900
    cloudflare_r2_endpoint_url: str = ""  # Backblaze B2 endpoint (reuses this env var name)

    # --- Stripe (optional — billing is disabled) ---
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
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

    # Number of trusted reverse-proxy hops in front of the app. Only the
    # Nth-from-right entry of X-Forwarded-For is trusted as the client IP.
    # The rightmost entry is appended by the proxy that connects to this
    # process and CANNOT be forged by a client, so hops=1 is always spoof-safe
    # (the security concern the original finding raised does not apply).
    #
    # Deployment note (Vercel -> Render): the path is browser -> Vercel Next.js
    # proxy -> Render edge -> app, so the app sees "clientIP, vercelEgressIP".
    # With hops=1 every proxied request keys by Vercel's egress IP — safe, but
    # all users share one rate-limit bucket (coarse, fine for a demo). Set to 2
    # to key by the real client IP, but only if the upstream (Vercel) sets
    # X-Forwarded-For authoritatively; otherwise 2 could reintroduce spoofing.
    # AI-cost limits (usage_tracker.check_budget) key on user_id, not IP, so
    # they are unaffected by this value either way. See middleware/rate_limiter.py.
    trusted_proxy_hops: int = 1

    job_translation_cache_days: int = 7

    # Global hard ceiling on request body size, enforced by BodySizeLimitMiddleware
    # before auth/routing. Set above the 10 MB resume-upload cap so uploads pass
    # and only absurd bodies are rejected early.
    max_request_body_bytes: int = 12 * 1024 * 1024  # 12 MB

    # --- Derived ---
    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def allowed_hosts_list(self) -> list[str]:
        return [h.strip() for h in self.allowed_hosts.split(",")]

    @property
    def clerk_authorized_parties_list(self) -> list[str]:
        return [p.strip() for p in self.clerk_authorized_parties.split(",") if p.strip()]

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
            raise ValueError(
                "DATABASE_SYNC_URL must use postgresql+psycopg2:// or postgresql:// scheme"
            )
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
