import { defineConfig, devices } from '@playwright/test'

/**
 * Hermetic end-to-end suite: the specs stub every `/api/v1/*` request with
 * `page.route` (see e2e/support/mock-api.ts), so nothing here needs a running
 * API, Postgres or GitHub — only the Next dev server, which Playwright starts.
 *
 * Not part of `npm run test`: that stays vitest/unit.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  },
})
