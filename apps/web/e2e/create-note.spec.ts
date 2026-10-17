import { expect, test } from '@playwright/test'

import { mockApi } from './support/mock-api'

test('creates a note and opens it in the editor', async ({ page }) => {
  await mockApi(page, { signedIn: true })

  await page.goto('/notes')

  await page.getByRole('button', { name: 'New note' }).click()

  // The created note is served back by the stub, so its editor loads for real.
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/)
  await expect(page.getByLabel('Note title')).toHaveValue('Untitled')
  await expect(page.getByLabel('Markdown content')).toBeVisible()

  // It also lands at the top of the sidebar list.
  await expect(page.getByRole('link', { name: /Untitled/ })).toBeVisible()
})
