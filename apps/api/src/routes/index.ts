import { Router } from 'express'
import { healthRouter } from './health.routes'

/**
 * Router mounted at `API_PREFIX` (`/api/v1`). HTTP wiring only: no logic,
 * no database access. Add one `*.routes.ts` module per resource here.
 */
export function createV1Router(): Router {
  const router = Router()

  router.use('/health', healthRouter)

  return router
}
