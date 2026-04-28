from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from clickhouse_driver import Client
from opentelemetry import trace

from alerts import maybe_alert
from config import settings
from scoring import compute_health_score, score_to_tier
from signals import compute_signals

logger = logging.getLogger(__name__)
tracer = trace.get_tracer("beacon.processor")

TOPIC_RAW = "beacon.events.raw"
TOPIC_DLQ = "beacon.events.dlq"


def get_clickhouse_client() -> Client:
    return Client(
        host=settings.CLICKHOUSE_HOST,
        port=settings.CLICKHOUSE_PORT,
        user=settings.CLICKHOUSE_USER,
        password=settings.CLICKHOUSE_PASSWORD,
        database=settings.CLICKHOUSE_DB,
    )


async def handle_event(event: dict, producer: AIOKafkaProducer, ch: Client) -> None:
    """Traite un event : calcule le score et persiste dans ClickHouse."""
    tenant_id = event["tenant_id"]

    with tracer.start_as_current_span("process_event") as span:
        span.set_attribute("tenant.id", tenant_id)
        span.set_attribute("event.type", event["type"])

        # Calcul des signaux depuis ClickHouse
        signals = await compute_signals(tenant_id, ch)

        # Calcul du score
        score = compute_health_score(signals)
        tier = score_to_tier(score)

        span.set_attribute("health.score", score)
        span.set_attribute("health.tier", tier)

        # Persistance dans ClickHouse
        ch.execute(
            "INSERT INTO beacon.health_scores (tenant_id, score, tier, signals, computed_at) VALUES",
            [{
                "tenant_id": tenant_id,
                "score": score,
                "tier": tier,
                "signals": json.dumps(signals.to_dict()),
                "computed_at": datetime.now(tz=timezone.utc),
            }],
        )

        # Vérification alerte churn
        await maybe_alert(tenant_id, score, producer, ch)

        logger.info(
            "Processed event tenant=%s type=%s score=%.3f tier=%s",
            tenant_id, event["type"], score, tier,
        )


async def run() -> None:
    """Boucle principale du consumer Kafka."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    ch = get_clickhouse_client()

    consumer = AIOKafkaConsumer(
        TOPIC_RAW,
        bootstrap_servers=settings.KAFKA_BROKERS,
        group_id=settings.KAFKA_GROUP_ID,
        auto_offset_reset=settings.KAFKA_AUTO_OFFSET_RESET,
        enable_auto_commit=False,   # commit manuel après traitement réussi
    )

    producer = AIOKafkaProducer(
        bootstrap_servers=settings.KAFKA_BROKERS,
        acks="all",
    )

    await consumer.start()
    await producer.start()
    logger.info("Processor started — consuming %s", TOPIC_RAW)

    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value)
                await handle_event(event, producer, ch)
                # Commit uniquement si le traitement a réussi
                await consumer.commit()

            except json.JSONDecodeError as e:
                logger.error("Malformed JSON in Kafka message: %s", e)
                await producer.send(TOPIC_DLQ, value=msg.value)
                await consumer.commit()  # on commit quand même pour avancer

            except Exception as e:
                logger.exception("Error processing event: %s", e)
                # Ne pas committer → le message sera re-traité

    finally:
        await consumer.stop()
        await producer.stop()
        logger.info("Processor stopped")


if __name__ == "__main__":
    asyncio.run(run())
