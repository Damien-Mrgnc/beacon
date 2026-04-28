-- DAU (Daily Active Users) sur 30 jours
-- Utilisée par la KPI card "Active Users"
-- Paramètres : {tenantId:String}

SELECT
    day,
    sum(unique_users) AS dau
FROM beacon.events_daily
WHERE
    tenant_id = {tenantId:String}
    AND day >= today() - 30
GROUP BY day
ORDER BY day ASC;
