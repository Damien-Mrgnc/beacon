from __future__ import annotations

import logging

from clickhouse_driver import Client

from scoring import HealthSignals

logger = logging.getLogger(__name__)

# Benchmark : nombre de logins/semaine considéré comme "actif"
DAU_BENCHMARK = 30


async def compute_signals(tenant_id: str, ch: Client) -> HealthSignals:
    """
    Calcule les 5 signaux de santé depuis ClickHouse.
    Toutes les requêtes utilisent des fenêtres glissantes.
    """

    # ── Signal 1 : tendance d'utilisation (cette semaine vs semaine passée) ──
    usage = ch.execute(
        """
        SELECT
            countIf(occurred_at >= now() - INTERVAL 7 DAY)                                 AS this_week,
            countIf(occurred_at BETWEEN now() - INTERVAL 14 DAY AND now() - INTERVAL 7 DAY) AS last_week
        FROM beacon.events
        WHERE tenant_id = %(tenant_id)s
        """,
        {"tenant_id": tenant_id},
    )
    this_week = usage[0][0] if usage else 0
    last_week = max(usage[0][1] if usage else 1, 1)
    trend = min(this_week / last_week, 2.0) / 2.0  # normalise [0, 1]

    # ── Signal 2 : fréquence de login (DAU sur 7j) ───────────────────────────
    logins = ch.execute(
        """
        SELECT uniqExact(user_id) AS dau
        FROM beacon.events
        WHERE tenant_id = %(tenant_id)s
          AND event_type = 'user.login'
          AND occurred_at >= now() - INTERVAL 7 DAY
        """,
        {"tenant_id": tenant_id},
    )
    dau = logins[0][0] if logins else 0
    login_freq = min(dau / DAU_BENCHMARK, 1.0)

    # ── Signal 3 : taux d'erreur inversé ─────────────────────────────────────
    errors = ch.execute(
        """
        SELECT
            countIf(event_type LIKE 'error%')   AS error_count,
            count()                              AS total_count
        FROM beacon.events
        WHERE tenant_id = %(tenant_id)s
          AND occurred_at >= now() - INTERVAL 7 DAY
        """,
        {"tenant_id": tenant_id},
    )
    error_count = errors[0][0] if errors else 0
    total_count = max(errors[0][1] if errors else 1, 1)
    error_rate = error_count / total_count
    error_rate_inv = max(1.0 - error_rate * 10, 0.0)  # amplifié car les erreurs sont rares

    # ── Signal 4 : adoption des features ─────────────────────────────────────
    KEY_FEATURES = ["api.call", "report.exported", "feature.used", "dashboard.viewed", "integration.configured"]
    features_used = ch.execute(
        """
        SELECT uniqExact(event_type) AS distinct_features
        FROM beacon.events
        WHERE tenant_id = %(tenant_id)s
          AND event_type IN %(features)s
          AND occurred_at >= now() - INTERVAL 30 DAY
        """,
        {"tenant_id": tenant_id, "features": KEY_FEATURES},
    )
    features_count = features_used[0][0] if features_used else 0
    feature_adoption = features_count / len(KEY_FEATURES)

    # ── Signal 5 : tickets support (placeholder — à brancher sur un vrai CRM) ─
    support_tickets_inv = 0.80  # valeur par défaut jusqu'à intégration CRM

    return HealthSignals(
        api_usage_7d_trend=round(trend, 4),
        login_frequency=round(login_freq, 4),
        error_rate_inverted=round(error_rate_inv, 4),
        feature_adoption=round(feature_adoption, 4),
        support_tickets_inv=support_tickets_inv,
    )
