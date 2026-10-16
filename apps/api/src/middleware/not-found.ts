import { toErrorResponse } from '../errors'
import type { Request, Response } from 'express'

/**
 * Terminal handler for unmatched routes. Registered after the v1 router and
 * before the error handler, so unknown routes still answer with JSON rather
 * than Express' default HTML 404 page.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(toErrorResponse('NOT_FOUND', `Route not found: ${req.method} ${req.path}`))
}
