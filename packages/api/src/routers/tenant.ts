import { z } from 'zod'
import { publicProcedure, router } from '../middleware/context'
import { chQuery, CLICKHOUSE_DB } from '../db/clickhouse'

interface TenantRow {
  tenant_id: string
  health_score: string
  tier: string
  computed_at: string
  event_count_7d: string
}

interface TenantDetailRow {
  tenant_id: string
  health_score: string
  tier: string
  computed_at: string
  dau: string
  error_rate: string
  active_features: string
}

export const tenantRouter = router({
  /** List all tenants with their latest health score */
  list: publicProcedure.query(async () => {
    const rows = await chQuery<TenantRow>(`
      SELECT
        hs.tenant_id,
        hs.health_score,
        hs.tier,
        hs.computed_at,
        countMerge(ev.event_count) AS event_count_7d
      FROM ${CLICKHOUSE_DB}.health_scores hs
      LEFT JOIN ${CLICKHOUSE_DB}.events_daily ev
        ON hs.tenant_id = ev.tenant_id
        AND ev.day >= today() - 7
      WHERE hs.computed_at >= now() - INTERVAL 1 HOUR
      GROUP BY hs.tenant_id, hs.health_score, hs.tier, hs.computed_at
      ORDER BY hs.health_score ASC
    `)

    return rows.map((r) => ({
      tenantId: r.tenant_id,
      healthScore: parseFloat(r.health_score),
      tier: r.tier as 'healthy' | 'at_risk' | 'critical',
      computedAt: r.computed_at,
      eventCount7d: parseInt(r.event_count_7d, 10),
    }))
  }),

  /** Get detail for a single tenant */
  getById: publicProcedure
    .input(z.object({ tenantId: z.string().min(1) }))
    .query(async ({ input }) => {
      const rows = await chQuery<TenantDetailRow>(`
        SELECT
          tenant_id,
          health_score,
          tier,
          computed_at,
          dau,
          error_rate,
          active_features
        FROM ${CLICKHOUSE_DB}.health_scores
        WHERE tenant_id = '${input.tenantId.replace(/'/g, "\\'")}'
        ORDER BY computed_at DESC
        LIMIT 1
      `)

      if (rows.length === 0) return null

      const r = rows[0]!
      return {
        tenantId: r.tenant_id,
        healthScore: parseFloat(r.health_score),
        tier: r.tier as 'healthy' | 'at_risk' | 'critical',
        computedAt: r.computed_at,
        dau: parseInt(r.dau, 10),
        errorRate: parseFloat(r.error_rate),
        activeFeatures: parseInt(r.active_features, 10),
      }
    }),
})
