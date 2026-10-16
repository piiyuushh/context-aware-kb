import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'

const VALID_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://kb:kb@localhost:5432/kb',
  SESSION_SECRET: 'secret',
  GITHUB_CLIENT_ID: 'id',
  GITHUB_CLIENT_SECRET: 'shh',
  GITHUB_OAUTH_CALLBACK_URL: 'http://localhost:4000/api/v1/auth/github/callback',
  GITHUB_TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
}

describe('loadConfig', () => {
  it('parses a complete environment', () => {
    const config = loadConfig(VALID_ENV)

    expect(config.isProduction).toBe(false)
    expect(config.tokenEncryptionKey).toHaveLength(32)
    expect(config.webAppUrl).toBe('http://localhost:3000')
  })

  it('flags production from NODE_ENV', () => {
    expect(loadConfig({ ...VALID_ENV, NODE_ENV: 'production' }).isProduction).toBe(true)
  })

  it('names the missing variable', () => {
    const { SESSION_SECRET: _omitted, ...incomplete } = VALID_ENV

    expect(() => loadConfig(incomplete)).toThrow(/SESSION_SECRET/)
  })

  it('rejects a malformed encryption key', () => {
    expect(() => loadConfig({ ...VALID_ENV, GITHUB_TOKEN_ENCRYPTION_KEY: 'too-short' })).toThrow(
      /GITHUB_TOKEN_ENCRYPTION_KEY/,
    )
  })
})
