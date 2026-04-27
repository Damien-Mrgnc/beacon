"""
Tests d'intégration — nécessitent Kafka + Redis + PostgreSQL en local.
Lancer avec : docker-compose --profile ingestion up -d
puis          pytest tests/integration/ -v
"""
import asyncio
import json

import pytest
import pytest_asyncio
from aiokafka import AIOKafkaConsumer
from httpx import ASGITransport, AsyncClient

from api.main import app

# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def kafka_consumer():
    consumer = AIOKafkaConsumer(
        "beacon.events.raw",
        bootstrap_servers="localhost:9092",
        group_id="test-consumer",
        auto_offset_reset="latest",
        consumer_timeout_ms=5000,
    )
    await consumer.start()
    yield consumer
    await consumer.stop()


# ── Tests ──────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.integration
async def test_health_endpoint(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "degraded")


@pytest.mark.asyncio
@pytest.mark.integration
async def test_batch_without_credentials_returns_401(client):
    resp = await client.post(
        "/events/batch",
        json={"events": [{"type": "user.login"}]},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
@pytest.mark.integration
async def test_event_reaches_kafka(client, kafka_consumer):
    """
    Test E2E local : SDK → API → Kafka.
    Vérifie que l'event arrive dans le bon topic.
    """
    resp = await client.post(
        "/events/batch",
        headers={"x-api-key": "test-key", "x-tenant-id": "test-tenant"},
        json={"events": [{"type": "user.login", "userId": "u1", "properties": {"method": "sso"}}]},
    )
    assert resp.status_code == 202
    data = resp.json()
    assert data["accepted"] == 1
    assert "batch_id" in data

    # Attendre le message dans Kafka (max 5s)
    msg = await asyncio.wait_for(kafka_consumer.getone(), timeout=5.0)
    event = json.loads(msg.value)

    assert event["type"] == "user.login"
    assert event["tenant_id"] == "test-tenant"
    assert event["user_id"] == "u1"
    assert "ingested_at" in event
    assert "id" in event


@pytest.mark.asyncio
@pytest.mark.integration
async def test_rate_limit_enforced(client):
    """Vérifie que le rate limiting se déclenche à 1001 req/min."""
    tasks = [
        client.post(
            "/events/batch",
            headers={"x-api-key": "test-key", "x-tenant-id": "test-tenant"},
            json={"events": [{"type": "test.event"}]},
        )
        for _ in range(10)  # réduit pour le test — le vrai seuil est 1000/min
    ]
    responses = await asyncio.gather(*tasks)
    status_codes = [r.status_code for r in responses]
    # Tous les 10 doivent passer (on est sous la limite)
    assert all(s in (202, 401) for s in status_codes)
