import { z } from 'zod'
import { publicProcedure, router } from '../middleware/context'
import { chQuery, CLICKHOUSE_DB } from '../db/clickhouse'

interface TenantRow {
  tenant_id: string
  score: string
  tier: string
  computed_at: string
  event_count_7d: string
  score_7d_ago: string
}

interface TenantDetailRow {
  tenant_id: string
  score: string
  tier: string
  computed_at: string
}

export const tenantRouter = router({
  list: publicProcedure.query(async () => {
    const rows = await chQuery<TenantRow>(`
      SELECT
        hs.tenant_id                     AS tenant_id,
        hs.score                         AS score,
        hs.tier                          AS tier,
        hs.computed_at                   AS computed_at,
        coalesce(sum(ev.event_count), 0) AS event_count_7d,
        coalesce(any(hs7.score), 0)      AS score_7d_ago
      FROM ${CLICKHOUSE_DB}.health_scores hs
      LEFT JOIN ${CLICKHOUSE_DB}.events_daily ev
        ON hs.tenant_id = ev.tenant_id AND ev.day >= today() - 7
      LEFT JOIN (
        SELECT tenant_id, argMax(score, computed_at) AS score
        FROM ${CLICKHOUSE_DB}.health_scores
        WHERE computed_at <= now() - INTERVAL 7 DAY
        GROUP BY tenant_id
      ) hs7 ON hs.tenant_id = hs7.tenant_id
      WHERE (hs.tenant_id, hs.computed_at) IN (
        SELECT tenant_id, max(computed_at)
        FROM ${CLICKHOUSE_DB}.health_scores
        GROUP BY tenant_id
      )
      GROUP BY hs.tenant_id, hs.score, hs.tier, hs.computed_at
      ORDER BY hs.score ASC
    `)

    return rows.map((r) => ({
      tenantId:     r.tenant_id,
      healthScore:  parseFloat(r.score),
      tier:         r.tier as 'healthy' | 'at_risk' | 'critical',
      computedAt:   r.computed_at,
      eventCount7d: parseInt(r.event_count_7d, 10),
      score7dAgo:   parseFloat(r.score_7d_ago) || null,
    }))
  }),

  getById: publicProcedure
    .input(z.object({ tenantId: z.string().min(1) }))
    .query(async ({ input }) => {
      const rows = await chQuery<TenantDetailRow>(`
        SELECT tenant_id, score, tier, computed_at
        FROM ${CLICKHOUSE_DB}.health_scores
        WHERE tenant_id = '${input.tenantId.replace(/'/g, "\\'")}'
        ORDER BY computed_at DESC
        LIMIT 1
      `)

      if (rows.length === 0) return null
      const r = rows[0]!
      return {
        tenantId:    r.tenant_id,
        healthScore: parseFloat(r.score),
        tier:        r.tier as 'healthy' | 'at_risk' | 'critical',
        computedAt:  r.computed_at,
      }
    }),
})
