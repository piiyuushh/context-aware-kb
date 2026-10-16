import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Compact signed session tokens (JWS, `HS256`): the session is a JWT-shaped
 * `header.payload.signature` string carried in an httpOnly cookie. Only the
 * user id and standard `iat`/`exp` claims are stored, so the payload carries
 * nothing sensitive.
 */
export interface SessionPayload {
  /** User id (`users.id`). */
  sub: string
  /** Issued at, seconds since epoch. */
  iat: number
  /** Expires at, seconds since epoch. */
  exp: number
}

interface SessionHeader {
  alg: 'HS256'
  typ: 'JWT'
}

const HEADER: SessionHeader = { alg: 'HS256', typ: 'JWT' }
const SIGNATURE_ALGORITHM = 'sha256'

export class SessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SessionError'
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function sign(data: string, secret: string): string {
  return createHmac(SIGNATURE_ALGORITHM, secret).update(data).digest('base64url')
}

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(actual)

  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
}

export function createSessionToken(
  userId: string,
  secret: string,
  ttlSeconds: number,
  issuedAtMs: number = Date.now(),
): string {
  const issuedAt = Math.floor(issuedAtMs / 1000)
  const payload: SessionPayload = {
    sub: userId,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }

  const header = encodeJson(HEADER)
  const body = encodeJson(payload)

  return `${header}.${body}.${sign(`${header}.${body}`, secret)}`
}

/** Verifies signature and expiry. Throws `SessionError` on any problem. */
export function verifySessionToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): SessionPayload {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new SessionError('Malformed session token')
  }

  const [header, body, signature] = parts
  if (header === undefined || body === undefined || signature === undefined) {
    throw new SessionError('Malformed session token')
  }

  if (!signaturesMatch(sign(`${header}.${body}`, secret), signature)) {
    throw new SessionError('Invalid session signature')
  }

  let parsedHeader: SessionHeader
  let payload: SessionPayload
  try {
    parsedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as SessionHeader
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
  } catch {
    throw new SessionError('Unreadable session token')
  }

  if (parsedHeader.alg !== HEADER.alg) {
    throw new SessionError('Unsupported session token algorithm')
  }

  if (typeof payload.sub !== 'string' || payload.sub === '') {
    throw new SessionError('Session token has no subject')
  }

  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs) {
    throw new SessionError('Session token has expired')
  }

  return payload
}
