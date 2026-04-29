import { z } from 'zod'
import { publicProcedure, router } from '../middleware/context'
import { chQuery, CLICKHOUSE_DB } from '../db/clickhouse'

interface AlertRow {
  tenant_id: string
  score: string
  tier: string
  computed_at: string
}

export const alertsRouter = router({
  /** All tenants currently in churn risk (score < 0.40) */
  list: publicProcedure
    .input(
      z.object({
        threshold: z.number().min(0).max(1).default(0.4),
        limit: z.number().int().min(1).max(100).default(50),
      }).optional(),
    )
    .query(async ({ input }) => {
      const threshold = input?.threshold ?? 0.4
      const limit = input?.limit ?? 50

      const rows = await chQuery<AlertRow>(`
        SELECT tenant_id, score, tier, computed_at
        FROM ${CLICKHOUSE_DB}.health_scores
        WHERE (tenant_id, computed_at) IN (
          SELECT tenant_id, max(computed_at)
          FROM ${CLICKHOUSE_DB}.health_scores
          GROUP BY tenant_id
        )
        AND score < ${threshold}
        ORDER BY score ASC
        LIMIT ${limit}
      `)

      return rows.map((r) => ({
        tenantId: r.tenant_id,
        healthScore: parseFloat(r.score),
        tier: r.tier as 'at_risk' | 'critical',
        computedAt: r.computed_at,
      }))
    }),
})
