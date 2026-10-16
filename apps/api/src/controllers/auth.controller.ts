import { getConfig } from '../config'
import { HttpError } from '../errors'
import {
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  oauthStateCookieOptions,
  sessionCookieOptions,
} from '../lib/cookies'
import { createSessionToken } from '../lib/session'
import { completeGitHubLogin, startGitHubLogin } from '../services/auth.service'
import type { Request, Response } from 'express'

/** Reads a single string query param, ignoring repeated/structured values. */
function readQueryString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** `GET /api/v1/auth/github` — kicks off the OAuth round-trip. */
export function startGitHubLoginHandler(_req: Request, res: Response): void {
  const { authorizeUrl, state } = startGitHubLogin()
  const { isProduction } = getConfig()

  res.cookie(OAUTH_STATE_COOKIE_NAME, state, oauthStateCookieOptions(isProduction))
  res.redirect(302, authorizeUrl)
}

/** `GET /api/v1/auth/github/callback` — validates state, issues the session. */
export async function completeGitHubLoginHandler(req: Request, res: Response): Promise<void> {
  const code = readQueryString(req.query.code)
  const state = readQueryString(req.query.state)

  if (!code) {
    throw new HttpError(400, 'BAD_REQUEST', 'Missing OAuth code')
  }

  if (!state) {
    throw new HttpError(403, 'FORBIDDEN', 'Missing OAuth state')
  }

  const cookieState: unknown = req.cookies?.[OAUTH_STATE_COOKIE_NAME]
  const { userId } = await completeGitHubLogin({
    code,
    state,
    cookieState: typeof cookieState === 'string' ? cookieState : undefined,
  })

  const { isProduction, sessionSecret, webAppUrl } = getConfig()
  const token = createSessionToken(userId, sessionSecret, SESSION_TTL_SECONDS)

  // Rotate the state cookie away and plant the session in one response.
  res.clearCookie(OAUTH_STATE_COOKIE_NAME, oauthStateCookieOptions(isProduction))
  res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions(isProduction))
  res.redirect(302, webAppUrl)
}

/** `POST /api/v1/auth/logout` — clears the session cookie. */
export function logoutHandler(_req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions(getConfig().isProduction))
  res.status(204).send()
}
