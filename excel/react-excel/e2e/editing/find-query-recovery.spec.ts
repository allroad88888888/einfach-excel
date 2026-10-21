import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const panel = (page: Page) => page.getByRole('dialog', { name: 'Find and replace' })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'B3', '2:1')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('Remember redo'); await input.press('Enter')
  await expect(cell(page, '2:1')).toHaveText('Remember redo')
  await button(page, 'Undo').click()
  await select(page, 'B3', '2:1')
  await page.locator('[data-workbook-grid]').press('Control+h')
  await panel(page).getByRole('textbox', { name: 'Find what' }).fill('Northwind')
  await panel(page).getByRole('combobox', { name: 'Within' }).selectOption('current-selection')
  await button(page, 'Find all').click()
  await expect(panel(page).getByText('Results 1–1 of 1', { exact: true })).toBeVisible()
})

for (const kind of ['empty', 'oversized', 'no-match']) for (const width of [1280, 390])
  test(`${kind} find query clears stale actions and recovers without losing redo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const dialog = panel(page)
    const query = dialog.getByRole('textbox', { name: 'Find what' })
    if (kind === 'empty') {
      await query.fill('')
      for (const name of ['Find next', 'Find all', 'Replace current', 'Replace all'])
        await expect(button(page, name)).toBeDisabled()
    } else if (kind === 'oversized') {
      for (const text of ['a'.repeat(4097), '中'.repeat(1366)]) {
        await query.fill(text)
        await button(page, 'Find next').click()
        await expect(dialog.getByRole('alert')).toContainText('1–4096 UTF-8 bytes')
        await expect(query).toHaveValue(text)
      }
    } else {
      await query.fill('not-present-92837')
      await button(page, 'Find next').click()
      await expect(dialog.getByText('No matches found.', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('alert')).toHaveCount(0)
    }
    await expect(dialog.getByRole('region', { name: 'All search results' })).toHaveCount(0)
    await expect(button(page, 'Previous')).toBeDisabled()
    await expect(button(page, 'Replace current')).toBeDisabled()
    await expect(cell(page, '2:1')).toHaveText('Northwind')
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await query.fill('Northwind')
    await button(page, 'Find next').click()
    await expect(dialog.getByText('1 of 1 · Sales Orders!B3', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveCount(0)
    await expect(button(page, 'Replace current')).toBeEnabled()
    await button(page, 'Close').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(cell(page, '2:1')).toHaveText('Remember redo')
    await button(page, 'Undo').click()
    await expect(cell(page, '2:1')).toHaveText('Northwind')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
  })
