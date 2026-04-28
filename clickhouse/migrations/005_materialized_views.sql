-- ─────────────────────────────────────────────────────────────────────────────
-- Agrégation par HEURE
-- Alimentée automatiquement à chaque INSERT dans beacon.events
-- Utilisée pour les graphiques temps réel (dernières 24h)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beacon.events_hourly
(
    tenant_id   LowCardinality(String),
    event_type  LowCardinality(String),
    hour        DateTime,
    event_count UInt64,
    unique_users UInt64
)
ENGINE = SummingMergeTree()
ORDER BY (tenant_id, event_type, hour);

CREATE MATERIALIZED VIEW IF NOT EXISTS beacon.events_hourly_mv
TO beacon.events_hourly
AS SELECT
    tenant_id,
    event_type,
    toStartOfHour(occurred_at)  AS hour,
    count()                     AS event_count,
    uniqExact(user_id)          AS unique_users
FROM beacon.events
GROUP BY tenant_id, event_type, hour;

-- ─────────────────────────────────────────────────────────────────────────────
-- Agrégation par JOUR
-- Utilisée pour les graphiques 7j / 30j / 90j
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS beacon.events_daily
(
    tenant_id   LowCardinality(String),
    event_type  LowCardinality(String),
    day         Date,
    event_count UInt64,
    unique_users UInt64
)
ENGINE = SummingMergeTree()
ORDER BY (tenant_id, event_type, day);

CREATE MATERIALIZED VIEW IF NOT EXISTS beacon.events_daily_mv
TO beacon.events_daily
AS SELECT
    tenant_id,
    event_type,
    toDate(occurred_at)         AS day,
    count()                     AS event_count,
    uniqExact(user_id)          AS unique_users
FROM beacon.events
GROUP BY tenant_id, event_type, day;
