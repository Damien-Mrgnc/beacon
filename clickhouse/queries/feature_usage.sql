-- Top features utilisées par un tenant sur N jours
-- Utilisée par le bar chart "Feature Usage" du dashboard
-- Paramètres : {tenantId:String}, {days:UInt32}

SELECT
    event_type,
    sum(event_count)    AS total_events,
    sum(unique_users)   AS total_users
FROM beacon.events_daily
WHERE
    tenant_id = {tenantId:String}
    AND day >= today() - {days:UInt32}
GROUP BY event_type
ORDER BY total_events DESC
LIMIT 10;
