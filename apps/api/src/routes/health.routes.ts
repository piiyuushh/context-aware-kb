import { Router } from 'express'
import { getHealthHandler } from '../controllers/health.controller'

/** Mounted at `/health` by the v1 router. */
export const healthRouter: Router = Router()

healthRouter.get('/', getHealthHandler)
