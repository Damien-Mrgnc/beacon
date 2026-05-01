"""
ChurnAnalyst — routes to the best available AI provider.

The provider is selected at runtime based on which API keys are configured
(see providers/router.py). Priority: anthropic > openai > gemini > mistral.

_extract_json and _parse_response are re-exported here for backward compatibility
with existing unit tests.
"""

import logging

from api.models.insights import ChurnInsight, TenantContext

# Re-export parsing utilities so tests can import them from this module
from providers.utils import extract_json as _extract_json  # noqa: F401
from providers.utils import parse_response as _parse_response  # noqa: F401

logger = logging.getLogger(__name__)


async def analyze_tenant(ctx: TenantContext) -> ChurnInsight:
    """
    Run churn analysis using the highest-priority configured AI provider.

    Raises:
        NoProviderAvailableError: if no API key is set in the environment.
        ValueError: if the provider returns unparseable output.
    """
    from providers.router import get_provider

    provider = get_provider()
    logger.info(
        "Analyzing tenant %s with %s (score=%.3f)",
        ctx.tenant_id,
        provider.name,
        ctx.health_score,
    )

    insight = await provider.analyze(ctx)

    logger.info(
        "Analysis complete for %s — %d risk factors, confidence=%.2f",
        ctx.tenant_id,
        len(insight.risk_factors),
        insight.confidence,
    )
    return insight
