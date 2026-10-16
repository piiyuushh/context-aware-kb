import { Router } from 'express'
import { listTagsHandler } from '../controllers/tags.controller'
import { requireAuth } from '../middleware/require-auth'

/** Mounted at `/tags` by the v1 router. Requires a session. */
export const tagsRouter: Router = Router()

tagsRouter.use(requireAuth)

tagsRouter.get('/', listTagsHandler)
