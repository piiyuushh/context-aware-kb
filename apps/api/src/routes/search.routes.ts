import { Router } from 'express'
import { searchHandler } from '../controllers/search.controller'
import { requireAuth } from '../middleware/require-auth'

/** Mounted at `/search` by the v1 router. Requires a session. */
export const searchRouter: Router = Router()

searchRouter.use(requireAuth)

searchRouter.get('/', searchHandler)
