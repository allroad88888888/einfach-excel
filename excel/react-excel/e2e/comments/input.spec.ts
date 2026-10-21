import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, marker, editor, author, body, openComments, closeComments, expectNeighbors } from './fixtures'

for (const width of [1280, 390]) test.describe(`${width}px comment validation`, () => {
  test.use({ viewport: { width, height: 850 } })
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'A2', '1:0'); await openComments(page)
  })

  for (const [label, value, message] of [
    ['blank display name', '', 'Enter a workbook display name.'],
    ['long display name', 'a'.repeat(101), 'Display name cannot exceed 100 characters.'],
  ]) test(`reject ${label} and recover at ${width}px`, async ({ page }) => {
    await author(page).fill(value); await body(page, false).fill('safe comment')
    await button(page, 'New comment').click()
    await expect(editor(page).getByRole('alert')).toHaveText(message)
    await expect(button(page, 'Undo')).toBeDisabled()
    await author(page).fill('Alice'); await button(page, 'New comment').click()
    await closeComments(page); await expect(marker(page, '1:0')).toHaveCount(1)
    await expectNeighbors(page)
  })

  for (const [label, value, message] of [
    ['blank comment', ' \n\t', 'Enter comment text.'],
    ['long comment', '🙂'.repeat(32768), 'Comment text cannot exceed 32767 characters.'],
  ]) test(`reject ${label} and recover at ${width}px`, async ({ page }) => {
    await author(page).fill('Alice'); await body(page, false).fill(value)
    await button(page, 'New comment').click()
    await expect(editor(page).getByRole('alert')).toHaveText(message)
    await expect(body(page, false)).toHaveValue(value)
    await expect(button(page, 'Undo')).toBeDisabled()
    await body(page, false).fill('recovered'); await button(page, 'New comment').click()
    await closeComments(page); await expect(marker(page, '1:0')).toHaveCount(1)
    await expectNeighbors(page)
  })
})
