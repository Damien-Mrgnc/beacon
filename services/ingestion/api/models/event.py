from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, field_validator


class IncomingEvent(BaseModel):
    """Event brut reçu depuis le SDK client."""

    type: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Nom de l'event en snake_case (ex: user.login, page.view)",
    )
    user_id: str | None = Field(None, max_length=256)
    properties: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime | None = Field(
        None,
        description="Timestamp côté client — si absent, on utilise l'heure d'ingestion",
    )

    @field_validator("type")
    @classmethod
    def validate_event_type(cls, v: str) -> str:
        import re

        if not re.match(r"^[a-z][a-z0-9_.]*$", v):
            raise ValueError(
                "event type must be lowercase alphanumeric with dots/underscores "
                "(e.g. 'user.login', 'page.view')"
            )
        return v

    @field_validator("properties")
    @classmethod
    def validate_properties_size(cls, v: dict[str, Any]) -> dict[str, Any]:
        import json

        if len(json.dumps(v)) > 10_000:
            raise ValueError("properties payload must be under 10KB")
        return v


class EventBatch(BaseModel):
    """Lot d'events envoyé par le SDK en une requête."""

    events: list[IncomingEvent] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Entre 1 et 100 events par batch",
    )


class EnrichedEvent(BaseModel):
    """Event enrichi prêt à être publié dans Kafka."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    tenant_id: str
    type: str
    user_id: str | None
    properties: dict[str, Any]
    occurred_at: datetime
    ingested_at: datetime = Field(
        default_factory=lambda: datetime.now(tz=timezone.utc)
    )
    sdk_version: str | None = None
    ip_hash: str | None = None  # hashé pour ne pas stocker l'IP brute

    def to_kafka_value(self) -> bytes:
        return self.model_dump_json().encode("utf-8")


class BatchAcceptedResponse(BaseModel):
    accepted: int
    batch_id: str
    ingested_at: datetime
