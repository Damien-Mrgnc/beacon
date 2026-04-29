-- Audit trail : qui a fait quoi, quand
-- Requis pour la compliance enterprise (SOC2, ISO27001)

CREATE TABLE IF NOT EXISTS beacon.audit_logs
(
    id          UUID            DEFAULT generateUUIDv4(),
    tenant_id   LowCardinality(String),
    actor_id    String,                   -- user_id de l'acteur
    action      LowCardinality(String),   -- ex: 'api_key.created', 'tenant.updated'
    resource    String,                   -- ressource ciblée
    metadata    String,                   -- JSON avec les détails
    ip_hash     String,                   -- IP hashée (RGPD)
    occurred_at DateTime64(3, 'UTC')      DEFAULT now64()
)
ENGINE = MergeTree()
ORDER BY (tenant_id, occurred_at)
TTL toDateTime(occurred_at) + INTERVAL 1 YEAR DELETE
SETTINGS index_granularity = 8192;
