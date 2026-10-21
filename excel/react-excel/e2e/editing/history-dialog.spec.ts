import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

for (const width of [1280, 390]) for (const action of ['Empty', 'Tab', 'Shift+Tab'])
  test(`${action} history dialog keeps keyboard focus and native redo at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
    if (action !== 'Empty') {
      const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
      await bar.fill('2')
      await bar.press('Enter')
      await expect(cell(page, '1:6')).toHaveText('158')
      await button(page, 'Undo').click()
      await expect(cell(page, '1:6')).toHaveText('79')
    }
    await button(page, 'Recent operations').click()
    const dialog = page.getByRole('dialog', { name: 'Recent operations', exact: true })
    const close = dialog.getByRole('button', { name: 'Close history', exact: true })
    await expect(close).toBeFocused()
    if (action === 'Empty') {
      await expect(dialog).toContainText('No recorded operations yet.')
      await expect(dialog.getByRole('listitem')).toHaveCount(0)
      await expect(dialog).toContainText('0 undo · 0 redo')
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      await expect(close).toBeInViewport()
      await page.screenshot({ path: info.outputPath(`history-empty-${width}.png`) })
    } else {
      await expect(dialog).toContainText('0 undo · 1 redo')
      await expect(dialog.getByRole('listitem')).toContainText('Sales Orders · E2:E2 · Undone')
      await page.keyboard.press(action)
      await expect(close).toBeFocused()
    }
    await close.click()
    await expect(dialog).toHaveCount(0)
    await expect(button(page, 'Recent operations')).toBeFocused()
    await expect(cell(page, '1:4')).toHaveText('1')
    await expect(cell(page, '1:6')).toHaveText('79')
    await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    await expect(button(page, 'Undo')).toBeDisabled()
    if (action === 'Empty') await expect(button(page, 'Redo')).toBeDisabled()
    else {
      await button(page, 'Redo').click()
      await expect(cell(page, '1:4')).toHaveText('2')
      await expect(cell(page, '1:6')).toHaveText('158')
    }
  })
