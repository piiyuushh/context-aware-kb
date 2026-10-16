import { Router } from 'express'
import {
  completeGitHubLoginHandler,
  logoutHandler,
  startGitHubLoginHandler,
} from '../controllers/auth.controller'

/** Mounted at `/auth` by the v1 router. */
export const authRouter: Router = Router()

authRouter.get('/github', startGitHubLoginHandler)
authRouter.get('/github/callback', completeGitHubLoginHandler)
authRouter.post('/logout', logoutHandler)
