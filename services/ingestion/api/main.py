from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from api.config import settings
from api.routers import events_router, health_router
from api.services.kafka import start_producer, stop_producer
from api.telemetry import setup_telemetry

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestion du cycle de vie : startup → yield → shutdown."""
    logger.info("Starting Beacon Ingestion API...")

    # Redis
    app.state.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    logger.info("Redis connected")

    # Kafka producer
    await start_producer()
    from api.services.kafka import _producer
    app.state.kafka_producer = _producer

    yield

    # Shutdown
    logger.info("Shutting down...")
    await stop_producer()
    await app.state.redis.aclose()


app = FastAPI(
    title="Beacon Ingestion API",
    description="Real-time event ingestion — receives SDK events, validates, and publishes to Kafka.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── OTEL ──────────────────────────────────────
setup_telemetry(
    app,
    service_name=settings.OTEL_SERVICE_NAME,
    otlp_endpoint=settings.OTEL_EXPORTER_OTLP_ENDPOINT or None,
)

# ── Rate limiting ─────────────────────────────
from api.routers.events import limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restreindre en prod
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────
app.include_router(events_router)
app.include_router(health_router)
