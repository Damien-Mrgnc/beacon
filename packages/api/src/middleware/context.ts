import { initTRPC } from '@trpc/server'
import { ZodError } from 'zod'

export function createContext() {
  return {}
}

export type Context = ReturnType<typeof createContext>

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router = t.router
export const publicProcedure = t.procedure
