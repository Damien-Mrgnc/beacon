import { z } from 'zod'
import { publicProcedure, router } from '../middleware/context'
import { chQuery, CLICKHOUSE_DB } from '../db/clickhouse'

interface LiveEventRow {
  event_id: string
  tenant_id: string
  event_type: string
  user_id: string
  timestamp: string
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
        SELECT event_id, tenant_id, event_type, user_id, timestamp
        FROM ${CLICKHOUSE_DB}.events
        WHERE tenant_id = '${input.tenantId.replace(/'/g, "\\'")}'
        ORDER BY timestamp DESC
        LIMIT ${input.limit}
      `)

      return rows.map((r) => ({
        eventId: r.event_id,
        tenantId: r.tenant_id,
        eventType: r.event_type,
        userId: r.user_id,
        timestamp: r.timestamp,
      }))
    }),

  /** Hourly event volume for a tenant over the last 24h */
  hourly: publicProcedure
    .input(z.object({ tenantId: z.string().min(1) }))
    .query(async ({ input }) => {
      const rows = await chQuery<HourlyStatRow>(`
        SELECT
          toStartOfHour(timestamp) AS hour,
          countMerge(event_count)  AS event_count,
          uniqMerge(unique_users)  AS unique_users
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
