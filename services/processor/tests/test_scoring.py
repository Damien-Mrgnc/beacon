"""
Tests unitaires du modèle de health scoring.
Aucune dépendance externe — 100% pur Python.
"""
import pytest

from scoring import HealthSignals, compute_health_score, score_to_tier


class TestComputeHealthScore:
    def test_perfect_tenant_scores_near_one(self):
        signals = HealthSignals(
            api_usage_7d_trend=1.0,
            login_frequency=1.0,
            error_rate_inverted=1.0,
            feature_adoption=1.0,
            support_tickets_inv=1.0,
        )
        score = compute_health_score(signals)
        assert score == 1.0

    def test_dead_tenant_scores_zero(self):
        signals = HealthSignals(
            api_usage_7d_trend=0.0,
            login_frequency=0.0,
            error_rate_inverted=0.0,
            feature_adoption=0.0,
            support_tickets_inv=0.0,
        )
        score = compute_health_score(signals)
        assert score == 0.0

    def test_healthy_tenant_above_threshold(self):
        signals = HealthSignals(
            api_usage_7d_trend=0.9,
            login_frequency=0.8,
            error_rate_inverted=0.95,
            feature_adoption=0.7,
            support_tickets_inv=0.9,
        )
        score = compute_health_score(signals)
        assert score >= 0.75
        assert score_to_tier(score) == "healthy"

    def test_at_risk_tenant(self):
        # Score attendu : 0.6×0.30 + 0.6×0.25 + 0.8×0.20 + 0.5×0.15 + 0.7×0.10 = 0.635
        signals = HealthSignals(
            api_usage_7d_trend=0.6,
            login_frequency=0.6,
            error_rate_inverted=0.8,
            feature_adoption=0.5,
            support_tickets_inv=0.7,
        )
        score = compute_health_score(signals)
        assert 0.50 <= score < 0.75
        assert score_to_tier(score) == "at_risk"

    def test_critical_tenant_below_churn_threshold(self):
        signals = HealthSignals(
            api_usage_7d_trend=0.1,
            login_frequency=0.1,
            error_rate_inverted=0.3,
            feature_adoption=0.1,
            support_tickets_inv=0.2,
        )
        score = compute_health_score(signals)
        assert score < 0.40
        assert score_to_tier(score) == "critical"

    def test_score_always_clamped_between_0_and_1(self):
        # Valeurs hors bornes ne doivent pas produire de score invalide
        signals = HealthSignals(2.0, 2.0, 2.0, 2.0, 2.0)
        assert compute_health_score(signals) <= 1.0

        signals = HealthSignals(-1.0, -1.0, -1.0, -1.0, -1.0)
        assert compute_health_score(signals) >= 0.0

    def test_score_is_rounded_to_4_decimals(self):
        signals = HealthSignals(0.333, 0.666, 0.777, 0.444, 0.555)
        score = compute_health_score(signals)
        assert score == round(score, 4)

    def test_weights_sum_to_one(self):
        from scoring import WEIGHTS
        assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9

    def test_most_important_signal_is_api_usage(self):
        from scoring import WEIGHTS
        max_weight_key = max(WEIGHTS, key=lambda k: WEIGHTS[k])
        assert max_weight_key == "api_usage_7d_trend"


class TestScoreToTier:
    @pytest.mark.parametrize("score,expected", [
        (1.00, "healthy"),
        (0.75, "healthy"),
        (0.74, "at_risk"),
        (0.50, "at_risk"),
        (0.49, "critical"),
        (0.00, "critical"),
    ])
    def test_tier_boundaries(self, score, expected):
        assert score_to_tier(score) == expected


class TestHealthSignals:
    def test_to_dict_has_all_keys(self):
        signals = HealthSignals(0.5, 0.5, 0.5, 0.5, 0.5)
        d = signals.to_dict()
        assert set(d.keys()) == {
            "api_usage_7d_trend",
            "login_frequency",
            "error_rate_inverted",
            "feature_adoption",
            "support_tickets_inv",
        }

    def test_to_dict_values_match_fields(self):
        signals = HealthSignals(0.1, 0.2, 0.3, 0.4, 0.5)
        d = signals.to_dict()
        assert d["api_usage_7d_trend"] == 0.1
        assert d["support_tickets_inv"] == 0.5
