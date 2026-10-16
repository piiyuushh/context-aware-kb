import { Router } from 'express'
import { authRouter } from './auth.routes'
import { graphRouter } from './graph.routes'
import { healthRouter } from './health.routes'
import { meRouter } from './me.routes'
import { notesRouter } from './notes.routes'
import { searchRouter } from './search.routes'
import { tagsRouter } from './tags.routes'

/**
 * Router mounted at `API_PREFIX` (`/api/v1`). HTTP wiring only: no logic,
 * no database access. Add one `*.routes.ts` module per resource here.
 */
export function createV1Router(): Router {
  const router = Router()

  router.use('/health', healthRouter)
  router.use('/auth', authRouter)
  router.use('/me', meRouter)
  router.use('/notes', notesRouter)
  router.use('/tags', tagsRouter)
  router.use('/search', searchRouter)
  router.use('/graph', graphRouter)

  return router
}
