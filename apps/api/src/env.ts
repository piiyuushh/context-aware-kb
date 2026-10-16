import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnvFile } from 'dotenv'

/**
 * Loads the repo-root `.env` as a side effect of importing this module.
 *
 * Kept in its own file (imported first by `server.ts`) so it runs before
 * anything reads `getConfig()`, and so it never runs under tests — those pass a
 * fixture straight to `loadConfig`.
 *
 * The API and the `db:migrate` scripts share this one file. Variables already
 * set in the process environment win: dotenv does not override them.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

loadEnvFile({ path: resolve(repoRoot, '.env'), quiet: true })
