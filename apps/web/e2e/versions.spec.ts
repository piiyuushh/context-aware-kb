import { expect, test } from '@playwright/test'

import { NOTE_ID, mockApi } from './support/mock-api'

test('exports the note and restores an earlier revision', async ({ page }) => {
  await mockApi(page, { signedIn: true })

  await page.goto(`/notes/${NOTE_ID}`)

  // A plain same-origin anchor, so the browser sends the session cookie.
  const exportLink = page.getByRole('link', { name: 'Export .md' })
  await expect(exportLink).toHaveAttribute('href', `/api/v1/notes/${NOTE_ID}/export`)
  await expect(exportLink).toHaveAttribute('download', 'postgres-index-tuning.md')

  await page.getByRole('button', { name: 'History' }).click()

  await expect(page.getByRole('heading', { name: 'History' })).toBeVisible()
  const restoreButton = page.getByRole('button', { name: /Restore the version from/ })
  await expect(restoreButton).toBeVisible()

  // Restoring goes through the confirmation dialog, like deleting does.
  await restoreButton.click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading', { name: 'Restore this revision?' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Restore' }).click()

  // The editor remounts on the restored revision, so the older body is shown.
  await expect(page.getByLabel('Markdown content')).toContainText('An earlier draft.')
})
