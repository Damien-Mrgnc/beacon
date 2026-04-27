from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from api.models.event import EnrichedEvent, IncomingEvent
from api.models.tenant import Tenant


class EventEnricher:
    """
    Enrichit les events bruts du SDK avant publication dans Kafka.
    Ajoute : tenant_id, id unique, timestamp normalisé, hash de l'IP.
    """

    @staticmethod
    def enrich(
        event: IncomingEvent,
        tenant: Tenant,
        sdk_version: str | None = None,
        client_ip: str | None = None,
    ) -> EnrichedEvent:
        return EnrichedEvent(
            tenant_id=tenant.id,
            type=event.type,
            user_id=event.user_id,
            properties=event.properties,
            # Si le client envoie un timestamp, on le respecte
            # Sinon on horodate à la réception
            occurred_at=event.timestamp or datetime.now(tz=timezone.utc),
            sdk_version=sdk_version,
            # On hashe l'IP pour la conformité RGPD — jamais l'IP brute
            ip_hash=EventEnricher._hash_ip(client_ip) if client_ip else None,
        )

    @staticmethod
    def enrich_batch(
        events: list[IncomingEvent],
        tenant: Tenant,
        sdk_version: str | None = None,
        client_ip: str | None = None,
    ) -> list[EnrichedEvent]:
        return [
            EventEnricher.enrich(e, tenant, sdk_version, client_ip)
            for e in events
        ]

    @staticmethod
    def _hash_ip(ip: str) -> str:
        return hashlib.sha256(ip.encode()).hexdigest()[:16]
