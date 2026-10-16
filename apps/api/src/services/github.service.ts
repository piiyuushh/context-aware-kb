import { getConfig } from '../config'
import { HttpError } from '../errors'
import type { AppConfig } from '../config'

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const API_BASE_URL = 'https://api.github.com'
const USER_AGENT = 'context-aware-kb'

/**
 * Scopes needed to read the profile, a verified email, the user's gists, and
 * repository contents (including private repos). `repo` is the only scope that
 * grants read access to private repositories; `gist` covers listing secret
 * gists and is a prerequisite for a future two-way sync.
 */
export const GITHUB_OAUTH_SCOPES = ['read:user', 'user:email', 'repo', 'gist'] as const

export interface GitHubToken {
  accessToken: string
  scopes: string[]
}

export interface GitHubProfile {
  githubId: string
  username: string
  email: string | null
  avatarUrl: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]

  return typeof value === 'string' && value !== '' ? value : null
}

/** Builds the URL the browser is redirected to, with the anti-CSRF `state`. */
export function buildAuthorizeUrl(state: string, config: AppConfig = getConfig()): string {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: GITHUB_OAUTH_SCOPES.join(' '),
    state,
  })

  return `${AUTHORIZE_URL}?${params.toString()}`
}

/**
 * Trades the one-time `code` for an access token. A rejected/expired code
 * comes back as a 200 with an `error` field, so both shapes are handled.
 */
export async function exchangeCodeForToken(
  code: string,
  config: AppConfig = getConfig(),
): Promise<GitHubToken> {
  let response: Response
  try {
    response = await fetch(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: config.github.callbackUrl,
      }),
    })
  } catch (cause) {
    throw new HttpError(500, 'INTERNAL_ERROR', `GitHub token exchange failed: ${String(cause)}`)
  }

  if (!response.ok) {
    throw new HttpError(500, 'INTERNAL_ERROR', `GitHub token exchange returned ${response.status}`)
  }

  const body: unknown = await response.json()
  if (!isRecord(body)) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'GitHub token exchange returned an invalid body')
  }

  const accessToken = readString(body, 'access_token')
  if (!accessToken) {
    // e.g. `bad_verification_code`: the user retried a consumed code.
    throw new HttpError(400, 'BAD_REQUEST', 'GitHub rejected the OAuth code')
  }

  const scope = readString(body, 'scope')

  return {
    accessToken,
    scopes: scope ? scope.split(/[\s,]+/).filter(Boolean) : [],
  }
}

async function githubApiGet(path: string, accessToken: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${accessToken}`,
        'user-agent': USER_AGENT,
      },
    })
  } catch (cause) {
    throw new HttpError(500, 'INTERNAL_ERROR', `GitHub API request failed: ${String(cause)}`)
  }

  if (!response.ok) {
    throw new HttpError(500, 'INTERNAL_ERROR', `GitHub API request returned ${response.status}`)
  }

  return response.json()
}

/** Primary email, used when the public profile hides it. Requires `user:email`. */
async function fetchPrimaryEmail(accessToken: string): Promise<string | null> {
  const emails = await githubApiGet('/user/emails', accessToken)
  if (!Array.isArray(emails)) {
    return null
  }

  for (const entry of emails as unknown[]) {
    if (isRecord(entry) && entry['primary'] === true) {
      return readString(entry, 'email')
    }
  }

  return null
}

export async function fetchGitHubProfile(accessToken: string): Promise<GitHubProfile> {
  const profile = await githubApiGet('/user', accessToken)
  if (!isRecord(profile)) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'GitHub user endpoint returned an invalid body')
  }

  const rawId = profile['id']
  const username = readString(profile, 'login')
  if ((typeof rawId !== 'number' && typeof rawId !== 'string') || !username) {
    throw new HttpError(
      500,
      'INTERNAL_ERROR',
      'GitHub user endpoint returned an incomplete profile',
    )
  }

  const email = readString(profile, 'email') ?? (await fetchPrimaryEmail(accessToken))

  return {
    githubId: String(rawId),
    username,
    email,
    avatarUrl: readString(profile, 'avatar_url'),
  }
}
