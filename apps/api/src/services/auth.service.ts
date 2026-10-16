import { randomBytes, timingSafeEqual } from 'node:crypto'
import { getConfig } from '../config'
import { encryptToken } from '../lib/crypto'
import { HttpError } from '../errors'
import { upsertGithubConnection } from '../repositories/github-connections.repository'
import { upsertGitHubUser } from '../repositories/users.repository'
import { buildAuthorizeUrl, exchangeCodeForToken, fetchGitHubProfile } from './github.service'

export interface StartedLogin {
  authorizeUrl: string
  /** Random anti-CSRF value; the controller stores it in a short-lived cookie. */
  state: string
}

export interface CompleteLoginInput {
  code: string
  state: string
  /** `state` echoed back from the browser cookie, when present. */
  cookieState: string | undefined
}

export interface CompletedLogin {
  userId: string
}

/** Constant-time compare so state checking cannot be probed by timing. */
function statesMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(actual)

  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
}

export function startGitHubLogin(): StartedLogin {
  const state = randomBytes(32).toString('base64url')

  return { authorizeUrl: buildAuthorizeUrl(state), state }
}

/**
 * Verifies the OAuth state, exchanges the code, and upserts the user plus their
 * encrypted GitHub connection. Returns the local user id to put in the session.
 */
export async function completeGitHubLogin(input: CompleteLoginInput): Promise<CompletedLogin> {
  if (!input.cookieState || !statesMatch(input.state, input.cookieState)) {
    throw new HttpError(403, 'FORBIDDEN', 'Invalid OAuth state')
  }

  const token = await exchangeCodeForToken(input.code)
  const profile = await fetchGitHubProfile(token.accessToken)

  const user = await upsertGitHubUser({
    githubId: profile.githubId,
    username: profile.username,
    email: profile.email,
    avatarUrl: profile.avatarUrl,
  })

  await upsertGithubConnection({
    userId: user.id,
    accessTokenEnc: encryptToken(token.accessToken, getConfig().tokenEncryptionKey),
    scopes: token.scopes,
  })

  return { userId: user.id }
}
