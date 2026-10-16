import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { API_PREFIX, errorResponseSchema } from '@kb/shared'
import { createApp } from '../src/app'
import { OAUTH_STATE_COOKIE_NAME, SESSION_COOKIE_NAME } from '../src/lib/cookies'
import { decryptToken, parseEncryptionKey } from '../src/lib/crypto'
import { upsertGithubConnection } from '../src/repositories/github-connections.repository'
import { upsertGitHubUser } from '../src/repositories/users.repository'
import { exchangeCodeForToken, fetchGitHubProfile } from '../src/services/github.service'
import type * as githubServiceModule from '../src/services/github.service'

vi.mock('../src/repositories/users.repository', () => ({
  upsertGitHubUser: vi.fn(),
  findUserById: vi.fn(),
}))

vi.mock('../src/repositories/github-connections.repository', () => ({
  upsertGithubConnection: vi.fn(),
  findGithubConnectionByUserId: vi.fn(),
}))

// Keep the pure URL builder real; stub only the network calls.
vi.mock('../src/services/github.service', async (importOriginal) => {
  const actual = await importOriginal<typeof githubServiceModule>()
  return { ...actual, exchangeCodeForToken: vi.fn(), fetchGitHubProfile: vi.fn() }
})

const START_URL = `${API_PREFIX}/auth/github`
const CALLBACK_URL = `${API_PREFIX}/auth/github/callback`
const LOGOUT_URL = `${API_PREFIX}/auth/logout`
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const GITHUB_TOKEN = 'gho_test_token'
const ENCRYPTION_KEY = parseEncryptionKey(process.env.GITHUB_TOKEN_ENCRYPTION_KEY ?? '')

/** Pulls the matching `set-cookie` header out of a response, if any. */
function findSetCookie(headers: Record<string, unknown>, name: string): string | undefined {
  const raw = headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []

  return cookies.find(
    (cookie): cookie is string => typeof cookie === 'string' && cookie.startsWith(`${name}=`),
  )
}

function cookieValue(cookie: string): string {
  const pair = cookie.split(';', 1)[0] ?? ''

  return pair.slice(pair.indexOf('=') + 1)
}

const PROFILE = {
  githubId: '42',
  username: 'octocat',
  email: 'octocat@example.com',
  avatarUrl: 'https://avatars.githubusercontent.com/u/42',
}

describe(`GET ${START_URL}`, () => {
  it('redirects to GitHub and sets an httpOnly state cookie', async () => {
    const response = await request(createApp()).get(START_URL)

    expect(response.status).toBe(302)
    const location = response.headers.location ?? ''
    expect(location).toContain('https://github.com/login/oauth/authorize')
    expect(location).toContain('client_id=test-client-id')
    expect(location).toContain('state=')

    const stateCookie = findSetCookie(response.headers, OAUTH_STATE_COOKIE_NAME)
    expect(stateCookie).toBeDefined()
    expect(stateCookie).toMatch(/HttpOnly/i)
  })
})

describe(`GET ${CALLBACK_URL}`, () => {
  beforeEach(() => {
    vi.mocked(exchangeCodeForToken).mockReset()
    vi.mocked(fetchGitHubProfile).mockReset()
    vi.mocked(upsertGitHubUser).mockReset()
    vi.mocked(upsertGithubConnection).mockReset()
  })

  it('responds 400 when the code is missing', async () => {
    const response = await request(createApp()).get(CALLBACK_URL)

    expect(response.status).toBe(400)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('BAD_REQUEST')
  })

  it('responds 403 when the state cookie does not match', async () => {
    const response = await request(createApp())
      .get(CALLBACK_URL)
      .query({ code: 'code-1', state: 'from-query' })
      .set('Cookie', `${OAUTH_STATE_COOKIE_NAME}=from-cookie`)

    expect(response.status).toBe(403)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('FORBIDDEN')
    expect(exchangeCodeForToken).not.toHaveBeenCalled()
  })

  it('completes login: stores an encrypted token and plants the session cookie', async () => {
    vi.mocked(exchangeCodeForToken).mockResolvedValue({
      accessToken: GITHUB_TOKEN,
      scopes: ['read:user', 'user:email'],
    })
    vi.mocked(fetchGitHubProfile).mockResolvedValue(PROFILE)
    vi.mocked(upsertGitHubUser).mockResolvedValue({
      id: USER_ID,
      ...PROFILE,
      createdAt: new Date().toISOString(),
    })

    const app = createApp()
    const start = await request(app).get(START_URL)
    const stateCookie = findSetCookie(start.headers, OAUTH_STATE_COOKIE_NAME)
    expect(stateCookie).toBeDefined()

    const callback = await request(app)
      .get(CALLBACK_URL)
      .query({ code: 'code-1', state: cookieValue(stateCookie ?? '') })
      .set('Cookie', stateCookie ?? '')

    expect(callback.status).toBe(302)
    expect(callback.headers.location).toBe(process.env.WEB_APP_URL)

    const sessionCookie = findSetCookie(callback.headers, SESSION_COOKIE_NAME)
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie).toMatch(/HttpOnly/i)

    expect(upsertGithubConnection).toHaveBeenCalledTimes(1)
    const stored = vi.mocked(upsertGithubConnection).mock.calls[0]?.[0]
    expect(stored?.userId).toBe(USER_ID)
    expect(stored?.scopes).toEqual(['read:user', 'user:email'])
    expect(decryptToken(stored?.accessTokenEnc ?? Buffer.alloc(0), ENCRYPTION_KEY)).toBe(
      GITHUB_TOKEN,
    )
  })
})

describe(`POST ${LOGOUT_URL}`, () => {
  it('responds 204 and clears the session cookie', async () => {
    const response = await request(createApp()).post(LOGOUT_URL)

    expect(response.status).toBe(204)
    const cleared = findSetCookie(response.headers, SESSION_COOKIE_NAME)
    expect(cleared).toBeDefined()
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/i)
  })
})
