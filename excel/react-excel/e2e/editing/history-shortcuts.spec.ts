import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'B3', '2:1')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('Shortcut edit'); await input.press('Enter')
  await expect(cell(page, '2:1')).toHaveText('Shortcut edit')
})

for (const key of ['Control+z', 'Meta+z', 'Control+y', 'Control+Shift+z', 'Meta+Shift+z', 'Meta+y'])
  for (const width of [1280, 390])
  test(`${key} grid history shortcut changes one native entry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const redo = key.endsWith('+y') || key.includes('Shift')
    if (redo) {
      await button(page, 'Undo').click()
      await expect(cell(page, '2:1')).toHaveText('Northwind')
    }
    await page.locator('[data-workbook-grid]').press(key)
    await expect(cell(page, '2:1')).toHaveText(redo ? 'Shortcut edit' : 'Northwind')
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await expect(button(page, 'Undo')).toBeEnabled({ enabled: redo })
    await expect(button(page, 'Redo')).toBeEnabled({ enabled: !redo })
    await button(page, 'Recent operations').click()
    await expect(page.getByRole('dialog')).toContainText(redo ? '1 undo · 0 redo' : '0 undo · 1 redo')
    await button(page, 'Close history').click()
    await button(page, redo ? 'Undo' : 'Redo').click()
    await expect(cell(page, '2:1')).toHaveText(redo ? 'Northwind' : 'Shortcut edit')
  })
