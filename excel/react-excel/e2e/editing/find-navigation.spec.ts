import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const panel = (page: Page) => page.getByRole('dialog', { name: 'Find and replace' })
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A85:C85', '84:0')
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
  await panel(page).getByRole('textbox', { name: 'Find what' }).fill('alpha')
  await panel(page).getByRole('combobox', { name: 'Within' }).selectOption('current-selection')
})

for (const action of ['Find next', 'Previous', 'Enter']) for (const width of [1280, 390])
  test(`${action} find navigates exact occurrences and wraps without editing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const query = panel(page).getByRole('textbox', { name: 'Find what' })
    if (action === 'Previous') await panel(page).getByRole('button', { name: 'Find next', exact: true }).click()
    const sequence = action === 'Previous'
      ? [[4, 'C85'], [3, 'B85'], [2, 'A85'], [1, 'A85'], [4, 'C85']]
      : [[1, 'A85'], [2, 'A85'], [3, 'B85'], [4, 'C85'], [1, 'A85']]
    for (const [occurrence, address] of sequence) {
      if (action === 'Enter') await query.press('Enter')
      else await panel(page).getByRole('button', { name: action, exact: true }).click()
      await expect(panel(page).getByText(`${occurrence} of 4 · Summary!${address}`, { exact: true })).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(String(address))
    }
    await panel(page).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(panel(page)).toHaveCount(0)
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    await expect(cell(page, '84:0')).toHaveText('😀alpha alpha')
    await expect(cell(page, '84:1')).toHaveText('ALPHA')
    await expect(cell(page, '84:2')).toHaveText('5')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled()
  })
