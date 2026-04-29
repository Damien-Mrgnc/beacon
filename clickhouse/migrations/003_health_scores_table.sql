-- Historique des health scores calculés par le Stream Processor
-- Conservé 90 jours (suffisant pour les graphiques dashboard)

CREATE TABLE IF NOT EXISTS beacon.health_scores
(
    tenant_id   LowCardinality(String),
    score       Float32,                  -- valeur entre 0.0 et 1.0
    tier        LowCardinality(String),   -- 'healthy' | 'at_risk' | 'critical'
    signals     String,                   -- JSON des signaux détaillés
    computed_at DateTime64(3, 'UTC')      DEFAULT now64()
)
ENGINE = MergeTree()
ORDER BY (tenant_id, computed_at)
TTL toDateTime(computed_at) + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192;
