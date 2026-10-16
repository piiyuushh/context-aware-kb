import { Router } from 'express'
import {
  getJobHandler,
  importHandler,
  listGistsHandler,
  listReposHandler,
  webhookHandler,
} from '../controllers/github.controller'
import { requireAuth } from '../middleware/require-auth'

/**
 * Mounted at `/github` by the v1 router.
 *
 * The webhook is registered before `requireAuth`: GitHub authenticates with its
 * HMAC signature, not a session cookie, so it must not be passed through the
 * session gate.
 */
export const githubRouter: Router = Router()

githubRouter.post('/webhook', webhookHandler)

githubRouter.use(requireAuth)

githubRouter.get('/gists', listGistsHandler)
githubRouter.get('/repos', listReposHandler)
githubRouter.post('/import', importHandler)
githubRouter.get('/jobs/:id', getJobHandler)
