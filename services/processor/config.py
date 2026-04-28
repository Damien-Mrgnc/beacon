from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_GROUP_ID: str = "beacon-processor"
    KAFKA_AUTO_OFFSET_RESET: str = "earliest"

    CLICKHOUSE_HOST: str = "localhost"
    CLICKHOUSE_PORT: int = 9000
    CLICKHOUSE_USER: str = "beacon"
    CLICKHOUSE_PASSWORD: str = "beacon"
    CLICKHOUSE_DB: str = "beacon"

    CHURN_THRESHOLD: float = 0.40
    RECOVERY_THRESHOLD: float = 0.55

    OTEL_SERVICE_NAME: str = "beacon-processor"


settings = Settings()
