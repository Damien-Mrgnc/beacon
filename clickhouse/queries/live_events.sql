-- Derniers events d'un tenant (live feed du dashboard)
-- Polling toutes les 2s par le tRPC server
-- Paramètres : {tenantId:String}, {limit:UInt32}

SELECT
    id,
    event_type,
    user_id,
    properties,
    occurred_at
FROM beacon.events
WHERE tenant_id = {tenantId:String}
ORDER BY occurred_at DESC
LIMIT {limit:UInt32};
