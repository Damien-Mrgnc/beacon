from __future__ import annotations

from dataclasses import dataclass


@dataclass
class HealthSignals:
    api_usage_7d_trend: float    # tendance d'utilisation sur 7j vs 7j précédents
    login_frequency: float        # DAU normalisé (0-1)
    error_rate_inverted: float    # 1 - taux d'erreur
    feature_adoption: float       # % de features clés utilisées
    support_tickets_inv: float    # 1 - volume normalisé de tickets

    def to_dict(self) -> dict[str, float]:
        return {
            "api_usage_7d_trend": self.api_usage_7d_trend,
            "login_frequency": self.login_frequency,
            "error_rate_inverted": self.error_rate_inverted,
            "feature_adoption": self.feature_adoption,
            "support_tickets_inv": self.support_tickets_inv,
        }


WEIGHTS: dict[str, float] = {
    "api_usage_7d_trend":   0.30,
    "login_frequency":       0.25,
    "error_rate_inverted":   0.20,
    "feature_adoption":      0.15,
    "support_tickets_inv":   0.10,
}


def compute_health_score(signals: HealthSignals) -> float:
    """
    Score pondéré entre 0.0 (critique) et 1.0 (excellent).
    Chaque signal est normalisé [0, 1] avant pondération.
    """
    raw = signals.to_dict()
    score = sum(WEIGHTS[k] * v for k, v in raw.items())
    return round(min(max(score, 0.0), 1.0), 4)


def score_to_tier(score: float) -> str:
    if score >= 0.75:
        return "healthy"
    if score >= 0.50:
        return "at_risk"
    return "critical"
