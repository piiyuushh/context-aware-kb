import { getConfig } from '../config'
import { HttpError } from '../errors'
import { SESSION_COOKIE_NAME } from '../lib/cookies'
import { verifySessionToken } from '../lib/session'
import type { Request, RequestHandler } from 'express'

/**
 * Gate for authenticated routes. Reads the session cookie, verifies the signed
 * token, and records the user id on the request. Any failure becomes a 401.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE_NAME]

  if (typeof token !== 'string') {
    next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'))
    return
  }

  try {
    const payload = verifySessionToken(token, getConfig().sessionSecret)
    req.userId = payload.sub
  } catch {
    next(new HttpError(401, 'UNAUTHORIZED', 'Invalid or expired session'))
    return
  }

  next()
}

/** Reads the user id set by `requireAuth`. Throws if the route is unguarded. */
export function requireUserId(req: Request): string {
  const { userId } = req
  if (!userId) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'Authenticated route is missing requireAuth')
  }

  return userId
}
