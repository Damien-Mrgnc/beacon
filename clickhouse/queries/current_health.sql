-- Score actuel d'un tenant (dernier score calculé)
-- Utilisée par la KPI card "Health Score"
-- Paramètres : {tenantId:String}

SELECT
    score,
    tier,
    signals,
    computed_at
FROM beacon.health_scores
WHERE tenant_id = {tenantId:String}
ORDER BY computed_at DESC
LIMIT 1;
