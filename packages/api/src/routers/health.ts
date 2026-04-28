import { z } from 'zod'
import { publicProcedure, router } from '../middleware/context'
import { chQuery, CLICKHOUSE_DB } from '../db/clickhouse'

interface HealthHistoryRow {
  day: string
  avg_score: string
  tier: string
}

interface CurrentScoreRow {
  health_score: string
  tier: string
  computed_at: string
}

export const healthRouter = router({
  /** Latest score for a tenant */
  current: publicProcedure
    .input(z.object({ tenantId: z.string().min(1) }))
    .query(async ({ input }) => {
      const rows = await chQuery<CurrentScoreRow>(`
        SELECT health_score, tier, computed_at
        FROM ${CLICKHOUSE_DB}.health_scores
        WHERE tenant_id = '${input.tenantId.replace(/'/g, "\\'")}'
        ORDER BY computed_at DESC
        LIMIT 1
      `)

      if (rows.length === 0) return null
      const r = rows[0]!
      return {
        healthScore: parseFloat(r.health_score),
        tier: r.tier as 'healthy' | 'at_risk' | 'critical',
        computedAt: r.computed_at,
      }
    }),

  /** Score history over the last N days (default 30) */
  history: publicProcedure
    .input(
      z.object({
        tenantId: z.string().min(1),
        days: z.number().int().min(1).max(90).default(30),
      }),
    )
    .query(async ({ input }) => {
      const rows = await chQuery<HealthHistoryRow>(`
        SELECT
          toDate(computed_at) AS day,
          avg(health_score)   AS avg_score,
          argMax(tier, computed_at) AS tier
        FROM ${CLICKHOUSE_DB}.health_scores
        WHERE
          tenant_id = '${input.tenantId.replace(/'/g, "\\'")}'
          AND computed_at >= today() - ${input.days}
        GROUP BY day
        ORDER BY day ASC
      `)

      return rows.map((r) => ({
        day: r.day,
        avgScore: parseFloat(r.avg_score),
        tier: r.tier as 'healthy' | 'at_risk' | 'critical',
      }))
    }),
})
