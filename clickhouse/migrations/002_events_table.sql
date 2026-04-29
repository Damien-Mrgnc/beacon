-- Table principale des événements produit
-- Partitionnée par mois pour les purges efficaces
-- Triée par (tenant_id, occurred_at) pour les requêtes par tenant

CREATE TABLE IF NOT EXISTS beacon.events
(
    id          UUID            DEFAULT generateUUIDv4(),
    tenant_id   LowCardinality(String),   -- optimisé pour les valeurs répétées
    event_type  LowCardinality(String),
    user_id     String,
    properties  String,                   -- JSON brut
    occurred_at DateTime64(3, 'UTC'),
    ingested_at DateTime64(3, 'UTC')      DEFAULT now64()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (tenant_id, occurred_at, event_type)
TTL toDateTime(occurred_at) + INTERVAL 1 YEAR DELETE
SETTINGS index_granularity = 8192;

-- Index bloom filter pour recherche rapide par user_id
ALTER TABLE beacon.events
    ADD INDEX idx_user_id (user_id) TYPE bloom_filter GRANULARITY 1;
