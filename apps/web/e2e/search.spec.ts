import { expect, test } from '@playwright/test'

import { SEARCH_TERM, mockApi } from './support/mock-api'

test('finds a note from the command palette and highlights the match', async ({ page }) => {
  await mockApi(page, { signedIn: true })

  await page.goto('/notes')

  // Wait for the shell before pressing the shortcut: AppShell attaches the
  // Mod-K listener only once the session check has resolved.
  await expect(page.getByRole('button', { name: 'New note' })).toBeVisible()

  // Mod-K opens the palette from anywhere in the shell.
  await page.keyboard.press('Control+k')

  const searchBox = page.getByRole('combobox', { name: 'Search notes' })
  await expect(searchBox).toBeVisible()

  await searchBox.fill(SEARCH_TERM)

  const results = page.getByRole('listbox', { name: 'Search results' })
  await expect(results.getByRole('option', { name: /Postgres index tuning/ })).toBeVisible()

  // The API's snippet marks come through as real `<mark>` elements.
  await expect(page.locator('mark').first()).toHaveText(SEARCH_TERM)
})
