-- Évolution du health score sur N jours
-- Utilisée par le graphique principal du dashboard tenant
-- Paramètres : {tenantId:String}, {days:UInt32}

SELECT
    toDate(computed_at)     AS day,
    avg(score)              AS avg_score,
    min(score)              AS min_score,
    max(score)              AS max_score,
    argMax(tier, computed_at) AS tier   -- tier du dernier score de la journée
FROM beacon.health_scores
WHERE
    tenant_id = {tenantId:String}
    AND computed_at >= now() - INTERVAL {days:UInt32} DAY
GROUP BY day
ORDER BY day ASC;
