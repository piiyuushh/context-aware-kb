import { Router } from 'express'
import { getMeHandler } from '../controllers/me.controller'
import { requireAuth } from '../middleware/require-auth'

/** Mounted at `/me` by the v1 router. Requires a valid session. */
export const meRouter: Router = Router()

meRouter.get('/', requireAuth, getMeHandler)
