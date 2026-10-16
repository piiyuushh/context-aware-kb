import express from 'express'
import cookieParser from 'cookie-parser'
import { API_PREFIX } from '@kb/shared'
import { errorHandler } from './middleware/error-handler'
import { notFoundHandler } from './middleware/not-found'
import { createV1Router } from './routes'
import type { Express } from 'express'

/**
 * Builds the Express application. Kept side-effect free (no `listen`) so tests
 * can hand the app straight to Supertest.
 *
 * Middleware order matters: parser, routes, 404, error handler last.
 */
export function createApp(): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json())
  app.use(cookieParser())

  app.use(API_PREFIX, createV1Router())

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
