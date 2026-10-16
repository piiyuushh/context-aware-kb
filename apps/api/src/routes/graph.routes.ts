import { Router } from 'express'
import { getGraphHandler, getNeighborsHandler } from '../controllers/graph.controller'
import { requireAuth } from '../middleware/require-auth'

/** Mounted at `/graph` by the v1 router. Every route requires a session. */
export const graphRouter: Router = Router()

graphRouter.use(requireAuth)

graphRouter.get('/', getGraphHandler)
graphRouter.get('/:noteId/neighbors', getNeighborsHandler)
