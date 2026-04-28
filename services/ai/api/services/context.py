"""
Fetch tenant context from ClickHouse for AI analysis.
"""

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
            user=os.getenv("CLICKHOUSE_USER", "default"),
            password=os.getenv("CLICKHOUSE_PASSWORD", ""),
            database=os.getenv("CLICKHOUSE_DB", "beacon"),
        )
    return _client


async def fetch_tenant_context(tenant_id: str) -> TenantContext | None:
    """
    Build a TenantContext from multiple ClickHouse queries.
    Returns None if the tenant has no data.
    """
    client = get_client()

    # Latest health score + tier
    score_rows = client.execute(
        """
        SELECT health_score, tier, dau, error_rate, active_features
        FROM beacon.health_scores
        WHERE tenant_id = %(tid)s
        ORDER BY computed_at DESC
        LIMIT 1
        """,
        {"tid": tenant_id},
    )
    if not score_rows:
        return None

    health_score, tier, dau, error_rate, active_features = score_rows[0]

    # Score 7 days ago for trend
    old_rows = client.execute(
        """
        SELECT health_score
        FROM beacon.health_scores
        WHERE tenant_id = %(tid)s
          AND computed_at <= now() - INTERVAL 7 DAY
        ORDER BY computed_at DESC
        LIMIT 1
        """,
        {"tid": tenant_id},
    )
    score_7d_ago = old_rows[0][0] if old_rows else None
    score_trend = (health_score - score_7d_ago) if score_7d_ago is not None else None

    # 30-day DAU average
    dau_rows = client.execute(
        """
        SELECT toUInt32(avg(dau_count))
        FROM (
            SELECT toDate(timestamp) AS day, uniq(user_id) AS dau_count
            FROM beacon.events
            WHERE tenant_id = %(tid)s
              AND timestamp >= today() - 30
            GROUP BY day
        )
        """,
        {"tid": tenant_id},
    )
    dau_30d_avg = dau_rows[0][0] if dau_rows else 0

    # Events in last 24h
    event_rows = client.execute(
        """
        SELECT count()
        FROM beacon.events
        WHERE tenant_id = %(tid)s
          AND timestamp >= now() - INTERVAL 24 HOUR
        """,
        {"tid": tenant_id},
    )
    event_count_24h = event_rows[0][0] if event_rows else 0

    # Days since last login event
    login_rows = client.execute(
        """
        SELECT dateDiff('day', max(timestamp), now())
        FROM beacon.events
        WHERE tenant_id = %(tid)s
          AND event_type = 'user.login'
        """,
        {"tid": tenant_id},
    )
    last_login_days_ago = login_rows[0][0] if login_rows and login_rows[0][0] else None

    return TenantContext(
        tenant_id=tenant_id,
        health_score=float(health_score),
        tier=tier,
        score_7d_ago=float(score_7d_ago) if score_7d_ago is not None else None,
        score_trend=float(score_trend) if score_trend is not None else None,
        dau=int(dau),
        dau_30d_avg=int(dau_30d_avg),
        error_rate=float(error_rate),
        active_features=int(active_features),
        last_login_days_ago=int(last_login_days_ago) if last_login_days_ago else None,
        event_count_24h=int(event_count_24h),
    )
