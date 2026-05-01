/**
 * ClickHouse HTTP client — thin wrapper around fetch.
 * Uses the JSON format for query results.
 */

const CLICKHOUSE_URL = process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123'
const CLICKHOUSE_USER = process.env['CLICKHOUSE_USER'] ?? 'default'
const CLICKHOUSE_PASSWORD = process.env['CLICKHOUSE_PASSWORD'] ?? ''
const CLICKHOUSE_DB = process.env['CLICKHOUSE_DB'] ?? 'beacon'

export { CLICKHOUSE_DB }

export async function chQuery<T>(query: string): Promise<T[]> {
  const url = new URL(CLICKHOUSE_URL)
  url.searchParams.set('user', CLICKHOUSE_USER)
  if (CLICKHOUSE_PASSWORD) url.searchParams.set('password', CLICKHOUSE_PASSWORD)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query.trim() + '\nFORMAT JSON',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ClickHouse error ${res.status}: ${text}`)
  }

  const body = (await res.json()) as { data: T[] }
  return body.data
}
