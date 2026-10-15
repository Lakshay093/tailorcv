from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    allowed_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    max_upload_mb: int = Field(default=5, ge=1, le=20)
    jd_min_chars: int = Field(default=100, ge=1)
    jd_max_chars: int = Field(default=30_000, le=100_000)
    max_resume_chars: int = Field(default=50_000, le=100_000)
    max_document_pages: int = Field(default=30, ge=1, le=100)
    provider_timeout_seconds: float = Field(default=45, ge=1, le=120)
    provider_retries: int = Field(default=2, ge=0, le=2)
    rate_limit_per_minute: int = Field(default=10, ge=1, le=100)
    resume_signing_key: str = "local-development-change-before-deploy"
    environment: str = "development"

    @property
    def origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.allowed_origins.split(",") if origin.strip()]

    @model_validator(mode="after")
    def production_settings(self):
        if self.jd_min_chars > self.jd_max_chars:
            raise ValueError("JD minimum cannot exceed maximum")
        if "*" in self.origins:
            raise ValueError("Explicit CORS origins are required")
        if self.environment == "production":
            if len(self.resume_signing_key) < 32 or self.resume_signing_key.startswith("local-"):
                raise ValueError("Production requires a shared random RESUME_SIGNING_KEY (32+ characters)")
            if not self.origins or any(not o.startswith("https://") for o in self.origins):
                raise ValueError("Production requires explicit HTTPS ALLOWED_ORIGINS")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
