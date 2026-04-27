from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    kafka: str
    redis: str
    database: str


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request) -> HealthResponse:
    """
    Vérifie la connectivité vers Kafka, Redis et PostgreSQL.
    Utilisé par ECS Fargate pour les health checks de container.
    """
    kafka_ok = False
    redis_ok = False
    db_ok = False

    # Kafka
    try:
        producer = request.app.state.kafka_producer
        if producer and producer._closed is False:
            kafka_ok = True
    except Exception:
        pass

    # Redis
    try:
        redis = request.app.state.redis
        await redis.ping()
        redis_ok = True
    except Exception:
        pass

    # PostgreSQL
    try:
        from api.services.database import engine
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    overall = "ok" if all([kafka_ok, redis_ok, db_ok]) else "degraded"

    return HealthResponse(
        status=overall,
        kafka="ok" if kafka_ok else "unreachable",
        redis="ok" if redis_ok else "unreachable",
        database="ok" if db_ok else "unreachable",
    )
