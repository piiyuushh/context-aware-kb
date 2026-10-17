import { expect, test } from '@playwright/test'

import { mockApi } from './support/mock-api'

test('sends a signed-out visitor to the login page', async ({ page }) => {
  await mockApi(page, { signedIn: false })

  // `/` redirects to `/notes`, whose AuthGuard bounces on the mocked 401.
  await page.goto('/')

  await expect(page).toHaveURL(/\/login$/)

  const signIn = page.getByRole('link', { name: 'Sign in with GitHub' })
  await expect(signIn).toBeVisible()
  await expect(signIn).toHaveAttribute('href', '/api/v1/auth/github')
})

test('renders the app shell for a signed-in session', async ({ page }) => {
  const api = await mockApi(page, { signedIn: false })

  // Sign in by flipping the stub, then load the app for real: a full navigation
  // builds a fresh session check, which is what a returning visitor sees.
  api.state.signedIn = true

  // The realtime bridge subscribes as soon as the authenticated layout mounts.
  const eventsRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/v1/events',
  )

  await page.goto('/notes')

  expect((await eventsRequest).method()).toBe('GET')

  await expect(page.getByRole('button', { name: 'New note' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Knowledge graph' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Select a note or create one' })).toBeVisible()

  // The note list comes from the mocked `GET /notes`.
  await expect(page.getByRole('link', { name: /Postgres index tuning/ })).toBeVisible()
})
