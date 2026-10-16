import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { API_PREFIX, errorResponseSchema, meResponseSchema } from '@kb/shared'
import { createApp } from '../src/app'
import { SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from '../src/lib/cookies'
import { createSessionToken } from '../src/lib/session'
import { findUserById } from '../src/repositories/users.repository'

vi.mock('../src/repositories/users.repository', () => ({
  upsertGitHubUser: vi.fn(),
  findUserById: vi.fn(),
}))

const ME_URL = `${API_PREFIX}/me`
const SESSION_SECRET = process.env.SESSION_SECRET ?? ''
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

function sessionCookie(userId: string): string {
  return `${SESSION_COOKIE_NAME}=${createSessionToken(userId, SESSION_SECRET, SESSION_TTL_SECONDS)}`
}

describe(`GET ${ME_URL}`, () => {
  beforeEach(() => {
    vi.mocked(findUserById).mockReset()
  })

  it('responds 401 UNAUTHORIZED without a session cookie', async () => {
    const response = await request(createApp()).get(ME_URL)

    expect(response.status).toBe(401)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('UNAUTHORIZED')
  })

  it('responds 401 for a tampered session cookie', async () => {
    const response = await request(createApp())
      .get(ME_URL)
      .set('Cookie', `${SESSION_COOKIE_NAME}=not-a-valid-token`)

    expect(response.status).toBe(401)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('UNAUTHORIZED')
  })

  it('responds 200 with the current user for a valid session', async () => {
    vi.mocked(findUserById).mockResolvedValue({
      id: USER_ID,
      githubId: '42',
      username: 'octocat',
      email: 'octocat@example.com',
      avatarUrl: 'https://avatars.githubusercontent.com/u/42',
      createdAt: new Date().toISOString(),
    })

    const response = await request(createApp()).get(ME_URL).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(200)
    const body = meResponseSchema.parse(response.body)
    expect(body.user.id).toBe(USER_ID)
    expect(body.user.username).toBe('octocat')
  })

  it('responds 401 when the session user no longer exists', async () => {
    vi.mocked(findUserById).mockResolvedValue(null)

    const response = await request(createApp()).get(ME_URL).set('Cookie', sessionCookie(USER_ID))

    expect(response.status).toBe(401)
    expect(errorResponseSchema.parse(response.body).error.code).toBe('UNAUTHORIZED')
  })
})
