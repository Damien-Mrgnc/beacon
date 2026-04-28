"""
Unit tests for ChurnAnalyst — Gemini is mocked, no API calls made.
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

GEMINI_RESPONSE = {
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


def make_mock_model(response_dict: dict) -> MagicMock:
    mock_response = MagicMock()
    mock_response.text = json.dumps(response_dict)
    mock_model = MagicMock()
    mock_model.generate_content.return_value = mock_response
    return mock_model


# ── Unit tests ────────────────────────────────────────────────────────────────

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


class TestParseResponse:
    def test_parses_risk_factors(self):
        insight = _parse_response(GEMINI_RESPONSE, CRITICAL_TENANT)
        assert len(insight.risk_factors) == 3
        assert insight.risk_factors[0].severity == RiskLevel.CRITICAL

    def test_actions_sorted_by_priority(self):
        response = {**GEMINI_RESPONSE, "recommended_actions": [
            {"priority": 2, "action": "B", "rationale": "r"},
            {"priority": 1, "action": "A", "rationale": "r"},
        ]}
        insight = _parse_response(response, CRITICAL_TENANT)
        assert insight.recommended_actions[0].priority == 1
        assert insight.recommended_actions[1].priority == 2

    def test_tenant_data_preserved(self):
        insight = _parse_response(GEMINI_RESPONSE, CRITICAL_TENANT)
        assert insight.tenant_id == "gamma-llc"
        assert insight.health_score == 0.22
        assert insight.tier == "critical"

    def test_confidence_parsed(self):
        insight = _parse_response(GEMINI_RESPONSE, CRITICAL_TENANT)
        assert insight.confidence == 0.88


class TestAnalyzeTenant:
    @pytest.mark.asyncio
    async def test_calls_gemini_and_returns_insight(self):
        mock_model = make_mock_model(GEMINI_RESPONSE)
        with patch("agents.churn_analyst._get_model", return_value=mock_model):
            insight = await analyze_tenant(CRITICAL_TENANT)

        assert insight.tenant_id == "gamma-llc"
        assert insight.diagnosis == GEMINI_RESPONSE["diagnosis"]
        assert len(insight.risk_factors) == 3
        mock_model.generate_content.assert_called_once()

    @pytest.mark.asyncio
    async def test_raises_on_invalid_gemini_output(self):
        mock_response = MagicMock()
        mock_response.text = "this is not json"
        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response

        with patch("agents.churn_analyst._get_model", return_value=mock_model):
            with pytest.raises(ValueError, match="invalid JSON"):
                await analyze_tenant(CRITICAL_TENANT)

    @pytest.mark.asyncio
    async def test_healthy_tenant_still_analyzed(self):
        mock_model = make_mock_model({**GEMINI_RESPONSE, "confidence": 0.4})
        with patch("agents.churn_analyst._get_model", return_value=mock_model):
            insight = await analyze_tenant(HEALTHY_TENANT)
        assert insight.tenant_id == "acme-corp"
