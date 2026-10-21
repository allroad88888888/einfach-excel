import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

for (const width of [1280, 390]) for (const action of ['Open', 'Close', 'Escape', 'Tab', 'Shift+Tab'])
  test(`${action} file dialog preserves native redo and restores focus at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'E2', '1:4')
    const bar = page.getByRole('textbox', { name: 'Active cell value', exact: true })
    await bar.fill('2')
    await bar.press('Enter')
    await expect(cell(page, '1:6')).toHaveText('158')
    await button(page, 'Undo').click()
    await expect(cell(page, '1:6')).toHaveText('79')
    await button(page, 'File').click()
    const dialog = page.getByRole('dialog', { name: 'Workbook files', exact: true })
    await expect(button(page, 'Download workbook')).toBeFocused()
    if (action === 'Open') {
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      for (const control of await dialog.locator('input, button').all())
        await expect(control).toBeInViewport()
      await page.screenshot({ path: info.outputPath(`file-open-${width}.png`) })
    }
    if (action === 'Tab' || action === 'Shift+Tab') {
      const first = button(page, 'Download workbook')
      const last = button(page, 'Close')
      await (action === 'Tab' ? last : first).focus()
      await page.keyboard.press(action)
      await expect(action === 'Tab' ? first : last).toBeFocused()
    }
    if (action === 'Escape') await page.keyboard.press('Escape')
    else await button(page, 'Close').click()
    await expect(dialog).toHaveCount(0)
    await expect(button(page, 'File')).toBeFocused()
    await expect(cell(page, '1:4')).toHaveText('1')
    await expect(cell(page, '1:4')).toHaveCSS('color', 'rgb(192, 0, 0)')
    await expect(cell(page, '1:5')).toHaveText('79')
    await expect(button(page, 'Undo')).toBeDisabled()
    await button(page, 'Redo').click()
    await expect(cell(page, '1:4')).toHaveText('2')
    await expect(cell(page, '1:6')).toHaveText('158')
    await expect(cell(page, '1:6')).toHaveCSS('font-family', 'Georgia')
  })
