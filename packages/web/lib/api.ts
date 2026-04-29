/**
 * Server-side tRPC caller — used directly in Server Components.
 * No HTTP overhead: calls the router functions directly.
 */

import { appRouter, createContext } from '@beacon/api'

const caller = appRouter.createCaller(createContext())

// Wrap each call to gracefully handle ClickHouse being unavailable
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    console.warn('[api] ClickHouse unavailable — returning fallback:', err)
    return fallback
  }
}

export const api = {
  tenant: {
    list: () => safe(() => caller.tenant.list(), []),
    getById: (tenantId: string) =>
      safe(() => caller.tenant.getById({ tenantId }), null),
  },
  health: {
    current: (tenantId: string) =>
      safe(() => caller.health.current({ tenantId }), null),
    history: (tenantId: string, days = 30) =>
      safe(() => caller.health.history({ tenantId, days }), []),
  },
  alerts: {
    list: () => safe(() => caller.alerts.list(), []),
  },
  events: {
    live: (tenantId: string) =>
      safe(() => caller.events.live({ tenantId, limit: 50 }), []),
    hourly: (tenantId: string) =>
      safe(() => caller.events.hourly({ tenantId }), []),
  },
}
