from __future__ import annotations

import logging

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter

logger = logging.getLogger(__name__)


def setup_telemetry(app, service_name: str, otlp_endpoint: str | None = None) -> None:
    """
    Configure OpenTelemetry.
    - En local (pas d'endpoint OTLP) : logs console uniquement.
    - En prod : envoie les traces vers AWS X-Ray via l'OTLP collector.
    """
    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)

    if otlp_endpoint:
        # Production : exporter vers le collector OTEL (→ AWS X-Ray)
        provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=otlp_endpoint))
        )
        logger.info("OTEL exporter configured → %s", otlp_endpoint)
    else:
        # Local : afficher les spans dans la console (utile pour debug)
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        logger.info("OTEL exporter: console (local mode)")

    trace.set_tracer_provider(provider)

    # Instrumentation automatique de FastAPI : chaque requête HTTP = un span
    FastAPIInstrumentor.instrument_app(app)
