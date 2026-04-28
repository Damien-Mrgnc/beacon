"""
Prompt templates for churn analysis.
Keeping prompts in a dedicated module makes them easy to version and A/B test.
"""

from api.models.insights import TenantContext


SYSTEM_PROMPT = """You are an expert Customer Success analyst for a B2B SaaS platform.
You analyze product usage data to identify churn risk and provide actionable recommendations.

You must respond with a valid JSON object matching exactly this schema:
{
  "diagnosis": "string — root cause in 2-3 sentences",
  "risk_factors": [
    {"signal": "string", "description": "string", "severity": "low|medium|high|critical"}
  ],
  "recommended_actions": [
    {"priority": 1|2|3, "action": "string", "rationale": "string"}
  ],
  "confidence": 0.0-1.0
}

Rules:
- diagnosis must be specific to the data, not generic
- risk_factors: 2 to 4 factors maximum
- recommended_actions: 2 to 3 actions, ordered by priority (1 = most urgent)
- confidence: how certain you are given the available data (lower if data is sparse)
- Never invent data not present in the context
"""


def build_analysis_prompt(ctx: TenantContext) -> str:
    trend_desc = "unknown"
    if ctx.score_trend is not None:
        if ctx.score_trend > 0.05:
            trend_desc = f"improving (+{ctx.score_trend:.2f} over 7 days)"
        elif ctx.score_trend < -0.05:
            trend_desc = f"declining ({ctx.score_trend:.2f} over 7 days)"
        else:
            trend_desc = "stable"

    dau_trend = ""
    if ctx.dau_30d_avg > 0:
        dau_change = ((ctx.dau - ctx.dau_30d_avg) / ctx.dau_30d_avg) * 100
        dau_trend = f" ({dau_change:+.0f}% vs 30d average)"

    feature_pct = (ctx.active_features / ctx.total_features * 100) if ctx.total_features else 0
    last_login = (
        f"{ctx.last_login_days_ago} days ago" if ctx.last_login_days_ago is not None
        else "unknown"
    )

    return f"""Analyze this customer account and identify churn risk factors.

CUSTOMER DATA:
- Tenant ID: {ctx.tenant_id}
- Health Score: {ctx.health_score:.3f} / 1.000 (tier: {ctx.tier})
- Score Trend: {trend_desc}
- Daily Active Users (today): {ctx.dau}{dau_trend}
- Error Rate: {ctx.error_rate:.1%}
- Feature Adoption: {ctx.active_features}/{ctx.total_features} features ({feature_pct:.0f}%)
- Last Admin Login: {last_login}
- Events (last 24h): {ctx.event_count_24h}

Provide your analysis as a JSON object matching the required schema."""
