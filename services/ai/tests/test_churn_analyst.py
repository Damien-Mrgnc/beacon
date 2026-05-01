"""
Unit tests for ChurnAnalyst — providers are mocked, no real API calls made.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from api.models.insights import RiskLevel, TenantContext
from agents.churn_analyst import _extract_json, _parse_response, analyze_tenant

# ── Fixtures ──────────────────────────────────────────────────────────────────

CRITICAL_TENANT = TenantContext(
    tenant_id="gamma-llc",
    health_score=0.22,
    tier="critical",
    score_7d_ago=0.45,
    score_trend=-0.23,
    dau=3,
    dau_30d_avg=28,
    error_rate=0.18,
    active_features=2,
    last_login_days_ago=12,
    event_count_24h=47,
)

HEALTHY_TENANT = TenantContext(
    tenant_id="acme-corp",
    health_score=0.82,
    tier="healthy",
    score_7d_ago=0.79,
    score_trend=0.03,
    dau=142,
    dau_30d_avg=138,
    error_rate=0.01,
    active_features=8,
    last_login_days_ago=0,
    event_count_24h=4200,
)

MOCK_RESPONSE = {
    "diagnosis": "Sharp DAU decline of 89% over 30 days combined with 18% error rate suggests a critical integration failure.",
    "risk_factors": [
        {"signal": "DAU collapse", "description": "From 28 to 3 daily users in 30 days", "severity": "critical"},
        {"signal": "High error rate", "description": "18% API errors — likely broken integration", "severity": "high"},
        {"signal": "Feature abandonment", "description": "Only 2/10 features active", "severity": "medium"},
    ],
    "recommended_actions": [
        {"priority": 1, "action": "Contact CTO within 24h", "rationale": "Error rate suggests technical emergency"},
        {"priority": 2, "action": "Schedule emergency onboarding", "rationale": "Feature adoption critically low"},
    ],
    "confidence": 0.88,
}


def make_mock_provider(response_dict: dict, model_name: str = "mock-model") -> AsyncMock:
    insight = _parse_response(response_dict, CRITICAL_TENANT, model_name)
    provider = AsyncMock()
    provider.name = model_name
    provider.analyze.return_value = insight
    return provider


# ── _extract_json ─────────────────────────────────────────────────────────────

class TestExtractJson:
    def test_plain_json(self):
        raw = '{"key": "value"}'
        assert _extract_json(raw) == {"key": "value"}

    def test_json_in_markdown_block(self):
        raw = '```json\n{"key": "value"}\n```'
        assert _extract_json(raw) == {"key": "value"}

    def test_json_in_plain_code_block(self):
        raw = '```\n{"key": "value"}\n```'
        assert _extract_json(raw) == {"key": "value"}

    def test_invalid_json_raises(self):
        with pytest.raises(json.JSONDecodeError):
            _extract_json("not json at all")


# ── _parse_response ───────────────────────────────────────────────────────────

class TestParseResponse:
    def test_parses_risk_factors(self):
        insight = _parse_response(MOCK_RESPONSE, CRITICAL_TENANT)
        assert len(insight.risk_factors) == 3
        assert insight.risk_factors[0].severity == RiskLevel.CRITICAL

    def test_actions_sorted_by_priority(self):
        response = {**MOCK_RESPONSE, "recommended_actions": [
            {"priority": 2, "action": "B", "rationale": "r"},
            {"priority": 1, "action": "A", "rationale": "r"},
        ]}
        insight = _parse_response(response, CRITICAL_TENANT)
        assert insight.recommended_actions[0].priority == 1
        assert insight.recommended_actions[1].priority == 2

    def test_tenant_data_preserved(self):
        insight = _parse_response(MOCK_RESPONSE, CRITICAL_TENANT)
        assert insight.tenant_id == "gamma-llc"
        assert insight.health_score == 0.22
        assert insight.tier == "critical"

    def test_confidence_parsed(self):
        insight = _parse_response(MOCK_RESPONSE, CRITICAL_TENANT)
        assert insight.confidence == 0.88

    def test_model_name_set(self):
        insight = _parse_response(MOCK_RESPONSE, CRITICAL_TENANT, "claude-opus-4-6")
        assert insight.model_used == "claude-opus-4-6"


# ── analyze_tenant ────────────────────────────────────────────────────────────

class TestAnalyzeTenant:
    @pytest.mark.asyncio
    async def test_calls_provider_and_returns_insight(self):
        mock_provider = make_mock_provider(MOCK_RESPONSE)
        with patch("providers.router.get_provider", return_value=mock_provider):
            insight = await analyze_tenant(CRITICAL_TENANT)

        assert insight.tenant_id == "gamma-llc"
        assert insight.diagnosis == MOCK_RESPONSE["diagnosis"]
        assert len(insight.risk_factors) == 3
        mock_provider.analyze.assert_called_once_with(CRITICAL_TENANT)

    @pytest.mark.asyncio
    async def test_raises_when_no_provider_configured(self):
        from providers.router import NoProviderAvailableError
        with patch("providers.router.get_provider", side_effect=NoProviderAvailableError("no key set")):
            with pytest.raises(NoProviderAvailableError):
                await analyze_tenant(CRITICAL_TENANT)

    @pytest.mark.asyncio
    async def test_healthy_tenant_still_analyzed(self):
        mock_provider = AsyncMock()
        mock_provider.name = "mock-model"
        mock_provider.analyze.return_value = _parse_response(
            {**MOCK_RESPONSE, "confidence": 0.4}, HEALTHY_TENANT, "mock-model"
        )
        with patch("providers.router.get_provider", return_value=mock_provider):
            insight = await analyze_tenant(HEALTHY_TENANT)
        assert insight.tenant_id == "acme-corp"
        assert insight.confidence == 0.4

    @pytest.mark.asyncio
    async def test_model_used_reflects_active_provider(self):
        mock_provider = make_mock_provider(MOCK_RESPONSE, model_name="claude-opus-4-6")
        with patch("providers.router.get_provider", return_value=mock_provider):
            insight = await analyze_tenant(CRITICAL_TENANT)
        assert insight.model_used == "claude-opus-4-6"
