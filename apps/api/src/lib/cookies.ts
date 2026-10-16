import type { CookieOptions } from 'express'

/** Cookie carrying the signed session token. */
export const SESSION_COOKIE_NAME = 'kb_session'

/** Short-lived cookie carrying the OAuth `state` anti-CSRF value. */
export const OAUTH_STATE_COOKIE_NAME = 'kb_oauth_state'

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
export const OAUTH_STATE_TTL_SECONDS = 60 * 10 // 10 minutes

/**
 * `Secure` only in production so the cookie still works over plain HTTP in
 * local development. `SameSite=Lax` lets the GitHub redirect carry the cookie
 * back to the callback while blocking cross-site POSTs (e.g. logout CSRF).
 */
export function sessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000,
  }
}

export function oauthStateCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
  }
}
