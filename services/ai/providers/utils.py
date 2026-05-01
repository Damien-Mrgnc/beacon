"""
Shared parsing utilities used by all providers.
Kept here to avoid circular imports between agents/ and providers/.
"""

import json
import re

from api.models.insights import (
    ChurnInsight,
    RecommendedAction,
    RiskFactor,
    RiskLevel,
    TenantContext,
)


def extract_json(text: str) -> dict:
    """Extract JSON from a model response, stripping markdown code fences if present."""
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1)
    return json.loads(text.strip())


def parse_response(raw: dict, ctx: TenantContext, model_name: str = "unknown") -> ChurnInsight:
    """Convert a raw provider JSON dict into a typed ChurnInsight."""
    risk_factors = [
        RiskFactor(
            signal=rf["signal"],
            description=rf["description"],
            severity=RiskLevel(rf["severity"]),
        )
        for rf in raw.get("risk_factors", [])
    ]

    actions = [
        RecommendedAction(
            priority=a["priority"],
            action=a["action"],
            rationale=a["rationale"],
        )
        for a in raw.get("recommended_actions", [])
    ]

    return ChurnInsight(
        tenant_id=ctx.tenant_id,
        health_score=ctx.health_score,
        tier=ctx.tier,
        diagnosis=raw["diagnosis"],
        risk_factors=risk_factors,
        recommended_actions=sorted(actions, key=lambda a: a.priority),
        confidence=float(raw.get("confidence", 0.7)),
        model_used=model_name,
    )
