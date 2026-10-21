import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'B3', '2:1')
  await page.getByRole('button', { name: 'Find and replace', exact: true }).click()
})

for (const entry of [
  { key: 'ArrowRight', start: 'Find', target: 'Replace' },
  { key: 'ArrowLeft', start: 'Find', target: 'Replace' },
  { key: 'Home', start: 'Replace', target: 'Find' },
  { key: 'End', start: 'Find', target: 'Replace' },
]) for (const width of [1280, 390])
  test(`${entry.key} find tabs synchronizes focused tab and panel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const dialog = page.getByRole('dialog', { name: 'Find and replace' })
    const query = dialog.getByRole('textbox', { name: 'Find what' })
    await query.fill('Northwind')
    const start = dialog.getByRole('tab', { name: entry.start, exact: true })
    if (entry.start === 'Replace') await start.click()
    await start.focus()
    await start.press(entry.key)
    const target = dialog.getByRole('tab', { name: entry.target, exact: true })
    await expect(target).toBeFocused()
    await expect(target).toHaveAttribute('aria-selected', 'true')
    await expect(target).toHaveAttribute('tabindex', '0')
    await expect(dialog.getByRole('tab', { name: entry.target === 'Find' ? 'Replace' : 'Find', exact: true }))
      .toHaveAttribute('tabindex', '-1')
    await expect(dialog.getByRole('tabpanel', { name: entry.target, exact: true })).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Replace with' }))
      .toHaveCount(entry.target === 'Replace' ? 1 : 0)
    await expect(query).toHaveValue('Northwind')
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B3')
    await expect(cell(page, '2:1')).toHaveText('Northwind')
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })

for (const key of ['Tab', 'Shift+Tab']) for (const width of [1280, 390])
  test(`${key} find dialog wraps focus inside its own controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const dialog = page.getByRole('dialog', { name: 'Find and replace' })
    const query = dialog.getByRole('textbox', { name: 'Find what' })
    await query.fill('Northwind')
    const first = dialog.getByRole('tab', { name: 'Find', exact: true })
    const last = dialog.getByRole('button', { name: 'Close', exact: true })
    const from = key === 'Tab' ? last : first
    const target = key === 'Tab' ? first : last
    await from.focus()
    await from.press(key)
    await expect(target).toBeFocused()
    await expect(first).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.getByRole('tabpanel', { name: 'Find', exact: true })).toBeVisible()
    await expect(query).toHaveValue('Northwind')
    await last.click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    await expect(cell(page, '2:1')).toHaveText('Northwind')
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
