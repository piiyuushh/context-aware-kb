import { expect, test } from '@playwright/test'

import { NOTE_TITLE, SNIPPET_TITLE, mockApi } from './support/mock-api'

test('renders the graph overview with its node list', async ({ page }) => {
  await mockApi(page, { signedIn: true })

  await page.goto('/graph')

  await expect(page.getByRole('heading', { name: 'Knowledge graph' })).toBeVisible()

  // The force layout is canvas, so the DOM side list carries the assertions.
  await expect(page.getByText('2 notes · 1 links')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Notes in view/ })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(NOTE_TITLE) })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(SNIPPET_TITLE) })).toBeVisible()
})
