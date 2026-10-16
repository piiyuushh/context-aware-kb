import { parseEncryptionKey } from './lib/crypto'

/** GitHub OAuth client settings. All three are required once auth is enabled. */
export interface GithubConfig {
  clientId: string
  clientSecret: string
  callbackUrl: string
  /**
   * Secret configured on the GitHub webhook. Optional so the app boots without
   * webhooks; the webhook endpoint answers 500 until it is set. Never logged.
   */
  webhookSecret: string
}

export interface AppConfig {
  nodeEnv: string
  isProduction: boolean
  databaseUrl: string
  sessionSecret: string
  /** Frontend origin to bounce back to after a successful OAuth login. */
  webAppUrl: string
  github: GithubConfig
  /** 32-byte AES-256-GCM key used to encrypt GitHub access tokens at rest. */
  tokenEncryptionKey: Buffer
}

const DEFAULT_WEB_APP_URL = 'http://localhost:3000'

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

/**
 * Reads and validates configuration from an env bag. Kept separate from
 * `getConfig` so tests can parse a fixture without touching `process.env`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development'

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    databaseUrl: required('DATABASE_URL', env.DATABASE_URL),
    sessionSecret: required('SESSION_SECRET', env.SESSION_SECRET),
    webAppUrl: env.WEB_APP_URL ?? DEFAULT_WEB_APP_URL,
    github: {
      clientId: required('GITHUB_CLIENT_ID', env.GITHUB_CLIENT_ID),
      clientSecret: required('GITHUB_CLIENT_SECRET', env.GITHUB_CLIENT_SECRET),
      callbackUrl: required('GITHUB_OAUTH_CALLBACK_URL', env.GITHUB_OAUTH_CALLBACK_URL),
      webhookSecret: env.GITHUB_WEBHOOK_SECRET ?? '',
    },
    tokenEncryptionKey: parseEncryptionKey(
      required('GITHUB_TOKEN_ENCRYPTION_KEY', env.GITHUB_TOKEN_ENCRYPTION_KEY),
    ),
  }
}

let cached: AppConfig | undefined

/** Parsed config, validated once per process. */
export function getConfig(): AppConfig {
  cached ??= loadConfig()

  return cached
}

/** Drops the memoized config. Test helper only. */
export function resetConfigCache(): void {
  cached = undefined
}
