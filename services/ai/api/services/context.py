"""
Fetch tenant context from ClickHouse for AI analysis.
"""

import json
import os

from clickhouse_driver import Client

from api.models.insights import TenantContext

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = Client(
            host=os.getenv("CLICKHOUSE_HOST", "localhost"),
            port=int(os.getenv("CLICKHOUSE_PORT", "9000")),
            user=os.getenv("CLICKHOUSE_USER", "beacon"),
            password=os.getenv("CLICKHOUSE_PASSWORD", "beacon"),
            database=os.getenv("CLICKHOUSE_DB", "beacon"),
        )
    return _client


async def fetch_tenant_context(tenant_id: str) -> TenantContext | None:
    client = get_client()

    # Latest health score + signals JSON
    score_rows = client.execute(
        """
        SELECT score, tier, signals
        FROM beacon.health_scores
        WHERE tenant_id = %(tid)s
        ORDER BY computed_at DESC
        LIMIT 1
        """,
        {"tid": tenant_id},
    )
    if not score_rows:
        return None

    health_score, tier, signals_raw = score_rows[0]
    signals: dict = json.loads(signals_raw) if signals_raw else {}

    # Derive metrics from signals JSON (set by stream processor)
    error_rate = 1.0 - float(signals.get("error_rate_inverted", 0.8))
    active_features = round(float(signals.get("feature_adoption", 0.5)) * 10)

    # Score 7 days ago for trend
    old_rows = client.execute(
        """
        SELECT score
        FROM beacon.health_scores
        WHERE tenant_id = %(tid)s
          AND computed_at <= now() - INTERVAL 7 DAY
        ORDER BY computed_at DESC
        LIMIT 1
        """,
        {"tid": tenant_id},
    )
    score_7d_ago = float(old_rows[0][0]) if old_rows else None
    score_trend = (health_score - score_7d_ago) if score_7d_ago is not None else None

    # DAU today
    dau_rows = client.execute(
        """
        SELECT uniqExact(user_id)
        FROM beacon.events
        WHERE tenant_id = %(tid)s
          AND occurred_at >= today()
        """,
        {"tid": tenant_id},
    )
    dau = int(dau_rows[0][0]) if dau_rows else 0

    # 30-day DAU average
    dau30_rows = client.execute(
        """
        SELECT toUInt32(avg(dau_count))
        FROM (
            SELECT toDate(occurred_at) AS day, uniqExact(user_id) AS dau_count
            FROM beacon.events
            WHERE tenant_id = %(tid)s
              AND occurred_at >= today() - 30
            GROUP BY day
        )
        """,
        {"tid": tenant_id},
    )
    dau_30d_avg = int(dau30_rows[0][0]) if dau30_rows else 0

    # Events in last 24h
    ev_rows = client.execute(
        """
        SELECT count()
        FROM beacon.events
        WHERE tenant_id = %(tid)s
          AND occurred_at >= now() - INTERVAL 24 HOUR
        """,
        {"tid": tenant_id},
    )
    event_count_24h = int(ev_rows[0][0]) if ev_rows else 0

    # Days since last login
    login_rows = client.execute(
        """
        SELECT dateDiff('day', max(occurred_at), now())
        FROM beacon.events
        WHERE tenant_id = %(tid)s
          AND event_type = 'user.login'
        """,
        {"tid": tenant_id},
    )
    last_login_days_ago = int(login_rows[0][0]) if login_rows and login_rows[0][0] else None

    return TenantContext(
        tenant_id=tenant_id,
        health_score=float(health_score),
        tier=tier,
        score_7d_ago=score_7d_ago,
        score_trend=float(score_trend) if score_trend is not None else None,
        dau=dau,
        dau_30d_avg=dau_30d_avg,
        error_rate=error_rate,
        active_features=active_features,
        last_login_days_ago=last_login_days_ago,
        event_count_24h=event_count_24h,
    )
