"""Tests unitaires des modèles Pydantic — aucune dépendance externe."""
import pytest
from pydantic import ValidationError

from api.models.event import EnrichedEvent, EventBatch, IncomingEvent


class TestIncomingEvent:
    def test_valid_event_types(self):
        IncomingEvent(type="user.login")
        IncomingEvent(type="page.view")
        IncomingEvent(type="api.call")
        IncomingEvent(type="feature_used")

    def test_invalid_event_type_uppercase(self):
        with pytest.raises(ValidationError, match="lowercase"):
            IncomingEvent(type="User.Login")

    def test_invalid_event_type_empty(self):
        with pytest.raises(ValidationError):
            IncomingEvent(type="")

    def test_invalid_event_type_starts_with_digit(self):
        with pytest.raises(ValidationError):
            IncomingEvent(type="123.event")

    def test_invalid_event_type_spaces(self):
        with pytest.raises(ValidationError):
            IncomingEvent(type="user login")

    def test_properties_size_limit(self):
        # Payload de 10KB+ doit être rejeté
        big_props = {"key": "x" * 10_001}
        with pytest.raises(ValidationError, match="10KB"):
            IncomingEvent(type="test", properties=big_props)

    def test_optional_fields_have_defaults(self):
        event = IncomingEvent(type="page.view")
        assert event.user_id is None
        assert event.properties == {}
        assert event.timestamp is None


class TestEventBatch:
    def test_valid_batch(self):
        batch = EventBatch(events=[IncomingEvent(type="user.login")])
        assert len(batch.events) == 1

    def test_empty_batch_rejected(self):
        with pytest.raises(ValidationError):
            EventBatch(events=[])

    def test_batch_over_limit_rejected(self):
        events = [IncomingEvent(type="page.view")] * 101
        with pytest.raises(ValidationError):
            EventBatch(events=events)

    def test_batch_at_limit_accepted(self):
        events = [IncomingEvent(type="page.view")] * 100
        batch = EventBatch(events=events)
        assert len(batch.events) == 100


class TestEnrichedEvent:
    def test_to_kafka_value_returns_bytes(self):
        from datetime import datetime, timezone

        event = EnrichedEvent(
            tenant_id="acme",
            type="user.login",
            user_id="u1",
            properties={},
            occurred_at=datetime.now(tz=timezone.utc),
        )
        value = event.to_kafka_value()
        assert isinstance(value, bytes)
        assert b"acme" in value
        assert b"user.login" in value

    def test_id_is_auto_generated(self):
        from datetime import datetime, timezone

        e1 = EnrichedEvent(tenant_id="t1", type="x", user_id=None, properties={}, occurred_at=datetime.now(tz=timezone.utc))
        e2 = EnrichedEvent(tenant_id="t1", type="x", user_id=None, properties={}, occurred_at=datetime.now(tz=timezone.utc))
        assert e1.id != e2.id
