"""
ChurnAnalyst — core AI agent.

Fetches tenant context from ClickHouse, calls Gemini,
returns a structured ChurnInsight.
"""

import json
import os
import re
import logging

import google.generativeai as genai

from api.models.insights import (
    ChurnInsight,
    RecommendedAction,
    RiskFactor,
    RiskLevel,
    TenantContext,
)
from prompts.churn_analysis import SYSTEM_PROMPT, build_analysis_prompt

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


def _get_model() -> genai.GenerativeModel:
    genai.configure(api_key=GEMINI_API_KEY)
    return genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        system_instruction=SYSTEM_PROMPT,
        generation_config=genai.GenerationConfig(
            temperature=0.2,          # low temp = consistent, factual output
            response_mime_type="application/json",
        ),
    )


def _extract_json(text: str) -> dict:
    """Extract JSON from model response, handling markdown code blocks."""
    # Strip ```json ... ``` if present
    match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if match:
        text = match.group(1)
    return json.loads(text.strip())


def _parse_response(raw: dict, ctx: TenantContext) -> ChurnInsight:
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
        model_used=GEMINI_MODEL,
    )


async def analyze_tenant(ctx: TenantContext) -> ChurnInsight:
    """
    Main entry point — call Gemini with tenant context, return structured insight.
    Raises ValueError if Gemini returns unparseable output.
    """
    model = _get_model()
    prompt = build_analysis_prompt(ctx)

    logger.info("Calling Gemini for tenant %s (score=%.3f)", ctx.tenant_id, ctx.health_score)

    response = model.generate_content(prompt)
    text = response.text

    try:
        raw = _extract_json(text)
    except (json.JSONDecodeError, AttributeError) as e:
        logger.error("Failed to parse Gemini response: %s\nRaw: %s", e, text)
        raise ValueError(f"Gemini returned invalid JSON: {e}") from e

    insight = _parse_response(raw, ctx)
    logger.info(
        "Analysis complete for %s — %d risk factors, confidence=%.2f",
        ctx.tenant_id,
        len(insight.risk_factors),
        insight.confidence,
    )
    return insight
