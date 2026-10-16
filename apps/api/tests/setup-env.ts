import { resetConfigCache } from '../src/config'

/**
 * Deterministic environment for the suite. Runs before any test module loads,
 * so `getConfig()` reads these values. Nothing here needs a live database or a
 * real GitHub app: repositories and the GitHub client are mocked per test.
 */
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://kb:kb@localhost:5432/kb'
process.env.SESSION_SECRET = 'test-session-secret'
process.env.GITHUB_CLIENT_ID = 'test-client-id'
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret'
process.env.GITHUB_OAUTH_CALLBACK_URL = 'http://localhost:4000/api/v1/auth/github/callback'
process.env.GITHUB_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64)
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret'
process.env.WEB_APP_URL = 'http://localhost:3000'

resetConfigCache()
