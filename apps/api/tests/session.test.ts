import { describe, expect, it } from 'vitest'
import { createSessionToken, SessionError, verifySessionToken } from '../src/lib/session'

const SECRET = 'test-secret'
const USER_ID = '3f1b1e3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
const TTL = 60 * 60

describe('session tokens', () => {
  it('round-trips a user id', () => {
    const token = createSessionToken(USER_ID, SECRET, TTL)
    const payload = verifySessionToken(token, SECRET)

    expect(payload.sub).toBe(USER_ID)
    expect(payload.exp).toBeGreaterThan(payload.iat)
  })

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken(USER_ID, SECRET, TTL)

    expect(() => verifySessionToken(token, 'other-secret')).toThrow(SessionError)
  })

  it('rejects a tampered payload', () => {
    const token = createSessionToken(USER_ID, SECRET, TTL)
    const [header, , signature] = token.split('.')
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: 'attacker', iat: 0, exp: 9_999_999_999 }),
    ).toString('base64url')

    expect(() => verifySessionToken(`${header}.${forgedBody}.${signature}`, SECRET)).toThrow(
      SessionError,
    )
  })

  it('rejects an expired token', () => {
    const token = createSessionToken(USER_ID, SECRET, TTL, Date.now() - 2 * TTL * 1000)

    expect(() => verifySessionToken(token, SECRET)).toThrow(/expired/)
  })

  it('rejects a malformed token', () => {
    expect(() => verifySessionToken('not-a-token', SECRET)).toThrow(SessionError)
  })
})
