/**
 * Scoring activities — fetch health score from ClickHouse via HTTP API.
 * Activities run in normal Node.js context (no sandbox restrictions).
 */

const CLICKHOUSE_URL = process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123'
const CLICKHOUSE_USER = process.env['CLICKHOUSE_USER'] ?? 'default'
const CLICKHOUSE_PASSWORD = process.env['CLICKHOUSE_PASSWORD'] ?? ''
const CLICKHOUSE_DB = process.env['CLICKHOUSE_DB'] ?? 'beacon'

interface ClickHouseRow {
  health_score: string
}

interface ClickHouseResponse {
  data: ClickHouseRow[]
}

/**
 * Fetch the latest computed health score for a tenant from ClickHouse.
 * Returns null if the tenant has no score yet.
 */
export async function getHealthScore(tenantId: string): Promise<number | null> {
  const query = `
    SELECT health_score
    FROM ${CLICKHOUSE_DB}.health_scores
    WHERE tenant_id = '${tenantId.replace(/'/g, "\\'")}'
    ORDER BY computed_at DESC
    LIMIT 1
    FORMAT JSON
  `

  const url = new URL(CLICKHOUSE_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('user', CLICKHOUSE_USER)
  if (CLICKHOUSE_PASSWORD) url.searchParams.set('password', CLICKHOUSE_PASSWORD)

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`ClickHouse query failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as ClickHouseResponse
  if (body.data.length === 0) return null

  return parseFloat(body.data[0]!.health_score)
}

/**
 * Fetch scores for all active tenants — used by HealthCheckWorkflow.
 */
export async function getAllTenantIds(): Promise<string[]> {
  const query = `
    SELECT DISTINCT tenant_id
    FROM ${CLICKHOUSE_DB}.events
    WHERE timestamp >= now() - INTERVAL 7 DAY
    FORMAT JSON
  `

  const url = new URL(CLICKHOUSE_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('user', CLICKHOUSE_USER)
  if (CLICKHOUSE_PASSWORD) url.searchParams.set('password', CLICKHOUSE_PASSWORD)

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`ClickHouse query failed: ${res.status}`)
  }

  const body = (await res.json()) as { data: Array<{ tenant_id: string }> }
  return body.data.map((r) => r.tenant_id)
}
