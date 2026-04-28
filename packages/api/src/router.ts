import { router } from './middleware/context'
import { tenantRouter } from './routers/tenant'
import { healthRouter } from './routers/health'
import { alertsRouter } from './routers/alerts'
import { eventsRouter } from './routers/events'

export { createContext } from './middleware/context'

export const appRouter = router({
  tenant: tenantRouter,
  health: healthRouter,
  alerts: alertsRouter,
  events: eventsRouter,
})

export type AppRouter = typeof appRouter
