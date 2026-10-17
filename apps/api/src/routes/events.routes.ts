import { Router } from 'express'
import { eventsHandler } from '../controllers/events.controller'
import { requireAuth } from '../middleware/require-auth'

/** Mounted at `/events` by the v1 router. Streams only the caller's events. */
export const eventsRouter: Router = Router()

eventsRouter.use(requireAuth)

eventsRouter.get('/', eventsHandler)
