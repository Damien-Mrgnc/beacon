import { z } from 'zod'
import { publicProcedure, router } from '../middleware/context'
import { chQuery, CLICKHOUSE_DB } from '../db/clickhouse'

interface LiveEventRow {
  id: string
  event_type: string
  user_id: string
  occurred_at: string
}

interface HourlyStatRow {
  hour: string
  event_count: string
  unique_users: string
}

export const eventsRouter = router({
  /** Last N events for a tenant — live feed */
  live: publicProcedure
    .input(
      z.object({
        tenantId: z.string().min(1),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const rows = await chQuery<LiveEventRow>(`
        SELECT id, event_type, user_id, occurred_at
        FROM ${CLICKHOUSE_DB}.events
        WHERE tenant_id = '${input.tenantId.replace(/'/g, "\\'")}'
        ORDER BY occurred_at DESC
        LIMIT ${input.limit}
      `)

      return rows.map((r) => ({
        eventId: r.id,
        eventType: r.event_type,
        userId: r.user_id,
        timestamp: r.occurred_at,
      }))
    }),

  /** Hourly event volume for a tenant over the last 24h */
  hourly: publicProcedure
    .input(z.object({ tenantId: z.string().min(1) }))
    .query(async ({ input }) => {
      const rows = await chQuery<HourlyStatRow>(`
        SELECT
          hour,
          sum(event_count) AS event_count,
          sum(unique_users) AS unique_users
        FROM ${CLICKHOUSE_DB}.events_hourly
        WHERE
          tenant_id = '${input.tenantId.replace(/'/g, "\\'")}'
          AND hour >= now() - INTERVAL 24 HOUR
        GROUP BY hour
        ORDER BY hour ASC
      `)

      return rows.map((r) => ({
        hour: r.hour,
        eventCount: parseInt(r.event_count, 10),
        uniqueUsers: parseInt(r.unique_users, 10),
      }))
    }),
})
