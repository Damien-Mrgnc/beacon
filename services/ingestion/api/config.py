from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Kafka
    KAFKA_BROKERS: str = "localhost:9092"

    # PostgreSQL
    DATABASE_URL: str = "postgresql+asyncpg://beacon:beacon@localhost:5432/beacon"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Rate limiting
    RATE_LIMIT_PER_TENANT: int = 1000  # req/min

    # OTEL
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4317"
    OTEL_SERVICE_NAME: str = "beacon-ingestion"


settings = Settings()
