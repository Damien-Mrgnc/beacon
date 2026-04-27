from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaError

from api.config import settings

logger = logging.getLogger(__name__)

TOPICS = {
    "raw": "beacon.events.raw",
    "processed": "beacon.events.processed",
    "alerts": "beacon.alerts",
    "dlq": "beacon.events.dlq",
}

_producer: AIOKafkaProducer | None = None


async def get_producer() -> AsyncGenerator[AIOKafkaProducer, None]:
    """Dependency FastAPI — retourne le producer singleton."""
    if _producer is None:
        raise RuntimeError("Kafka producer not initialized — call start_producer() first")
    yield _producer


async def start_producer() -> None:
    """Appelé au démarrage de l'app (lifespan)."""
    global _producer
    _producer = AIOKafkaProducer(
        bootstrap_servers=settings.KAFKA_BROKERS,
        # Compression snappy pour réduire le réseau
        compression_type="gzip",
        # Attendre que tous les replicas aient acquitté (fiabilité)
        acks="all",
        # Retries automatiques sur erreur réseau transitoire
        retry_backoff_ms=200,
        max_batch_size=16384,
        linger_ms=5,  # micro-batching : attendre 5ms pour regrouper les messages
    )
    await _producer.start()
    logger.info("Kafka producer started — brokers=%s", settings.KAFKA_BROKERS)


async def stop_producer() -> None:
    """Appelé à l'arrêt de l'app (lifespan)."""
    global _producer
    if _producer:
        await _producer.stop()
        _producer = None
        logger.info("Kafka producer stopped")


async def send_to_dlq(producer: AIOKafkaProducer, raw_value: bytes, reason: str) -> None:
    """Envoie un message malformé dans la Dead Letter Queue."""
    try:
        import json

        dlq_payload = json.dumps({"raw": raw_value.decode(errors="replace"), "reason": reason})
        await producer.send(TOPICS["dlq"], value=dlq_payload.encode())
    except KafkaError:
        logger.exception("Failed to send to DLQ")
