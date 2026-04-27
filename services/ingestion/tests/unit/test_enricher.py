"""Tests unitaires de l'EventEnricher."""
from datetime import datetime, timezone

import pytest

from api.models.event import IncomingEvent
from api.models.tenant import Tenant
from api.services.enricher import EventEnricher


@pytest.fixture
def tenant() -> Tenant:
    return Tenant(id="acme-corp", name="Acme Corp")


@pytest.fixture
def event() -> IncomingEvent:
    return IncomingEvent(type="user.login", user_id="user_42", properties={"method": "sso"})


class TestEventEnricher:
    def test_enriched_has_tenant_id(self, event, tenant):
        enriched = EventEnricher.enrich(event, tenant)
        assert enriched.tenant_id == "acme-corp"

    def test_enriched_copies_event_fields(self, event, tenant):
        enriched = EventEnricher.enrich(event, tenant)
        assert enriched.type == "user.login"
        assert enriched.user_id == "user_42"
        assert enriched.properties == {"method": "sso"}

    def test_timestamp_fallback_to_now(self, tenant):
        event = IncomingEvent(type="page.view")
        before = datetime.now(tz=timezone.utc)
        enriched = EventEnricher.enrich(event, tenant)
        after = datetime.now(tz=timezone.utc)
        assert before <= enriched.occurred_at <= after

    def test_client_timestamp_preserved(self, tenant):
        ts = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        event = IncomingEvent(type="page.view", timestamp=ts)
        enriched = EventEnricher.enrich(event, tenant)
        assert enriched.occurred_at == ts

    def test_ip_is_hashed_not_raw(self, event, tenant):
        enriched = EventEnricher.enrich(event, tenant, client_ip="192.168.1.1")
        assert enriched.ip_hash is not None
        assert "192.168.1.1" not in (enriched.ip_hash or "")
        assert len(enriched.ip_hash) == 16  # 16 chars du hash

    def test_no_ip_gives_none_hash(self, event, tenant):
        enriched = EventEnricher.enrich(event, tenant, client_ip=None)
        assert enriched.ip_hash is None

    def test_enrich_batch_returns_all(self, tenant):
        events = [IncomingEvent(type=f"event.{i}") for i in range(5)]
        enriched = EventEnricher.enrich_batch(events, tenant)
        assert len(enriched) == 5
        assert all(e.tenant_id == "acme-corp" for e in enriched)

    def test_each_enriched_event_has_unique_id(self, tenant):
        events = [IncomingEvent(type="page.view")] * 3
        enriched = EventEnricher.enrich_batch(events, tenant)
        ids = [e.id for e in enriched]
        assert len(set(ids)) == 3  # tous différents
