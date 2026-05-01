/**
 * Beacon — k6 Load Test (M11)
 *
 * Usage:
 *   k6 run load/full-stack.js
 *   k6 run --env API_URL=https://your-alb.amazonaws.com load/full-stack.js
 *
 * Scenarios:
 *   ingestion  → ramp up to 1000 VUs (event ingestion throughput)
 *   dashboard  → 20 concurrent users reading the dashboard (p95 latency)
 *
 * Thresholds:
 *   p99 ingestion < 100ms
 *   p95 dashboard < 500ms
 *   error rate    < 0.5%
 */

import http  from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// ── Config ────────────────────────────────────────────────────────────────────

const API_URL   = __ENV.API_URL   || 'http://127.0.0.1:8000'
const API_KEY   = __ENV.API_KEY   || 'load-test-key'
const TENANT_ID = __ENV.TENANT_ID || 'load-test'
const BASE_URL  = __ENV.BASE_URL  || 'http://127.0.0.1:3000'

// ── Custom metrics ────────────────────────────────────────────────────────────

const ingestionErrors  = new Rate('ingestion_errors')
const dashboardErrors  = new Rate('dashboard_errors')
const e2eLatency       = new Trend('e2e_latency_ms', true)

// ── Thresholds & Scenarios ────────────────────────────────────────────────────

export const options = {
  scenarios: {
    ingestion: {
      executor:  'ramping-vus',
      startVUs:  0,
      stages: [
        { duration: '30s', target: 100  },   // ramp up
        { duration: '2m',  target: 1000 },   // peak load
        { duration: '30s', target: 0    },   // ramp down
      ],
      exec:       'ingestEvents',
      gracefulRampDown: '10s',
    },
    dashboard: {
      executor:  'constant-vus',
      vus:       20,
      duration:  '3m',
      startTime: '10s',
      exec:      'readDashboard',
    },
  },
  thresholds: {
    // Ingestion : p99 < 100ms, < 0.5% errors
    'http_req_duration{scenario:ingestion}': ['p(99)<100'],
    ingestion_errors:                        ['rate<0.005'],
    // Dashboard : p95 < 500ms, < 0.5% errors
    'http_req_duration{scenario:dashboard}': ['p(95)<500'],
    dashboard_errors:                        ['rate<0.005'],
    // Global error rate
    http_req_failed:                         ['rate<0.005'],
  },
}

// ── Scenario: Event Ingestion ─────────────────────────────────────────────────

export function ingestEvents() {
  const payload = JSON.stringify({
    events: Array.from({ length: 10 }, (_, i) => ({
      type:       'user.action',
      tenant_id:  TENANT_ID,
      user_id:    `user_${__VU}_${i}`,
      properties: { feature: 'load-test', iteration: __ITER },
      timestamp:  new Date().toISOString(),
    })),
  })

  const res = http.post(`${API_URL}/events/batch`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key':    API_KEY,
      'x-tenant-id':  TENANT_ID,
    },
    tags: { scenario: 'ingestion' },
  })

  const ok = check(res, {
    '202 accepted': (r) => r.status === 202,
    'has accepted count': (r) => {
      try { return JSON.parse(r.body).accepted > 0 } catch { return false }
    },
  })
  ingestionErrors.add(!ok)
}

// ── Scenario: Dashboard Read ──────────────────────────────────────────────────
// Hits Next.js SSR pages (server components fetch ClickHouse directly)

export function readDashboard() {
  const start = Date.now()

  // 1. Overview dashboard (renders tenant list + health scores)
  const overviewRes = http.get(`${BASE_URL}/`, {
    tags: { scenario: 'dashboard', page: 'overview' },
  })
  check(overviewRes, { 'dashboard 200': (r) => r.status === 200 })
  dashboardErrors.add(overviewRes.status !== 200)

  sleep(0.5)

  // 2. Tenant detail page (most expensive — 30-day health history query)
  const tenantRes = http.get(`${BASE_URL}/tenants/acme-corp`, {
    tags: { scenario: 'dashboard', page: 'tenant' },
  })
  check(tenantRes, { 'tenant page 200': (r) => r.status === 200 })
  dashboardErrors.add(tenantRes.status !== 200)

  sleep(0.5)

  // 3. Alerts page
  const alertsRes = http.get(`${BASE_URL}/alerts`, {
    tags: { scenario: 'dashboard', page: 'alerts' },
  })
  check(alertsRes, { 'alerts 200': (r) => r.status === 200 })
  dashboardErrors.add(alertsRes.status !== 200)

  e2eLatency.add(Date.now() - start)
  sleep(1)
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export function setup() {
  const res = http.get(`${API_URL}/health`)
  if (res.status !== 200) {
    throw new Error(`Ingestion API not healthy: status ${res.status}`)
  }
  console.log(`Load test targeting: ${API_URL}`)
}
