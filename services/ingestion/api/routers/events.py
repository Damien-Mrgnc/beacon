import asyncio
import logging

from aiokafka import AIOKafkaProducer
from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from api.models.event import BatchAcceptedResponse, EventBatch
from api.models.tenant import Tenant
from api.services.auth import verify_api_key
from api.services.database import get_db
from api.services.enricher import EventEnricher
from api.services.kafka import TOPICS, get_producer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["events"])

limiter = Limiter(key_func=lambda req: req.headers.get("x-tenant-id", get_remote_address(req)))


def _get_redis(request: Request):
    return request.app.state.redis


def _get_tenant_dep(request: Request, db=Depends(get_db), redis=Depends(_get_redis)):
    return verify_api_key(request, db, redis)


@router.post(
    "/batch",
    status_code=202,
    response_model=BatchAcceptedResponse,
    summary="Ingest a batch of events",
    description="Accepts up to 100 events per request. Returns 202 immediately — processing is async.",
)
async def ingest_batch(
    request: Request,
    batch: EventBatch,
    producer: AIOKafkaProducer = Depends(get_producer),
    db=Depends(get_db),
    redis=Depends(_get_redis),
) -> BatchAcceptedResponse:
    from opentelemetry import trace

    tracer = trace.get_tracer("beacon.ingestion")

    with tracer.start_as_current_span("ingest_batch") as span:
        # Auth
        tenant: Tenant = await verify_api_key(request, db, redis)

        span.set_attribute("tenant.id", tenant.id)
        span.set_attribute("batch.size", len(batch.events))

        # Enrichissement
        sdk_version = request.headers.get("x-sdk-version")
        client_ip = request.headers.get("x-forwarded-for") or request.client.host if request.client else None

        enriched = EventEnricher.enrich_batch(
            batch.events,
            tenant,
            sdk_version=sdk_version,
            client_ip=client_ip,
        )

        # Publication parallèle dans Kafka
        await asyncio.gather(*[
            producer.send(
                TOPICS["raw"],
                key=tenant.id.encode("utf-8"),
                value=e.to_kafka_value(),
            )
            for e in enriched
        ])

        logger.info("Ingested %d events for tenant %s", len(enriched), tenant.id)

        from datetime import datetime, timezone

        return BatchAcceptedResponse(
            accepted=len(enriched),
            batch_id=enriched[0].id,
            ingested_at=datetime.now(tz=timezone.utc),
        )
