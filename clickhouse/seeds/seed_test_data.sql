-- ─────────────────────────────────────────────────────────────────────────────
-- SEED : données de test réalistes pour 3 tenants
-- Simule 30 jours d'activité avec des patterns différents
--
-- Usage :
--   docker exec beacon-clickhouse clickhouse-client --database beacon < seeds/seed_test_data.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Tenant 1 : "acme-corp" — client sain (score attendu ~0.80)
INSERT INTO beacon.events (tenant_id, event_type, user_id, properties, occurred_at)
SELECT
    'acme-corp'                                                     AS tenant_id,
    arrayElement(
        ['user.login', 'page.view', 'api.call', 'feature.used', 'report.exported'],
        (rand() % 5) + 1
    )                                                               AS event_type,
    concat('user_', toString(rand() % 40))                          AS user_id,
    '{"source":"web"}'                                              AS properties,
    now() - toIntervalSecond(rand() % (30 * 86400))                 AS occurred_at
FROM numbers(50000);

-- Tenant 2 : "beta-inc" — client à risque (volume faible, peu d'users)
INSERT INTO beacon.events (tenant_id, event_type, user_id, properties, occurred_at)
SELECT
    'beta-inc'                                                      AS tenant_id,
    arrayElement(['user.login', 'page.view'], (rand() % 2) + 1)    AS event_type,
    concat('user_', toString(rand() % 5))                           AS user_id,
    '{}'                                                            AS properties,
    now() - toIntervalSecond(rand() % (30 * 86400))                 AS occurred_at
FROM numbers(3000);

-- Tenant 3 : "gamma-llc" — client critique (quasi inactif depuis 2 semaines)
INSERT INTO beacon.events (tenant_id, event_type, user_id, properties, occurred_at)
SELECT
    'gamma-llc'                                                     AS tenant_id,
    'user.login'                                                    AS event_type,
    'user_1'                                                        AS user_id,
    '{}'                                                            AS properties,
    now() - toIntervalSecond((rand() % (14 * 86400)) + 14 * 86400) AS occurred_at
FROM numbers(200);

-- ─────────────────────────────────────────────────────────────────────────────
-- Health scores simulés (normalement calculés par le Processor)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO beacon.health_scores (tenant_id, score, tier, signals, computed_at)
SELECT
    'acme-corp',
    0.75 + (rand() % 20) / 100.0,
    'healthy',
    '{"api_usage_7d_trend":0.9,"login_frequency":0.85,"error_rate_inverted":0.95,"feature_adoption":0.7,"support_tickets_inv":0.9}',
    now() - toIntervalHour(number * 6)
FROM numbers(120);  -- 30 jours × 4 calculs/jour

INSERT INTO beacon.health_scores (tenant_id, score, tier, signals, computed_at)
SELECT
    'beta-inc',
    0.45 + (rand() % 10) / 100.0,
    'at_risk',
    '{"api_usage_7d_trend":0.4,"login_frequency":0.3,"error_rate_inverted":0.8,"feature_adoption":0.2,"support_tickets_inv":0.6}',
    now() - toIntervalHour(number * 6)
FROM numbers(120);

INSERT INTO beacon.health_scores (tenant_id, score, tier, signals, computed_at)
SELECT
    'gamma-llc',
    0.20 + (rand() % 10) / 100.0,
    'critical',
    '{"api_usage_7d_trend":0.1,"login_frequency":0.05,"error_rate_inverted":0.6,"feature_adoption":0.1,"support_tickets_inv":0.3}',
    now() - toIntervalHour(number * 6)
FROM numbers(120);
