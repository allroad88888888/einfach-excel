import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'B6', '5:1')
})

for (const action of ['Open', 'Tab', 'Shift+Tab']) for (const width of [1280, 390])
  test(`${action} border dialog preserves native settings and selection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    const original = await cell(page, '5:1').textContent()
    await button(page, 'Border settings').click()
    const dialog = page.getByRole('dialog', { name: 'Borders', exact: true })
    const position = page.getByLabel('Position', { exact: true })
    await expect(position).toBeFocused()
    await expect(page.getByLabel('Line style', { exact: true })).toHaveValue('double')
    await expect(page.getByLabel('Hex color', { exact: true })).toHaveValue('#c00000')
    if (action !== 'Open') {
      await page.getByLabel('Line style', { exact: true }).selectOption('medium')
      await page.getByLabel('Hex color', { exact: true }).fill('#abcdef')
      if (action === 'Tab') await button(page, 'Apply borders').focus()
      else await position.focus()
      await page.keyboard.press(action)
      await expect(action === 'Tab' ? position : button(page, 'Apply borders')).toBeFocused()
      await expect(page.getByLabel('Line style', { exact: true })).toHaveValue('medium')
      await expect(page.getByLabel('Hex color', { exact: true })).toHaveValue('#abcdef')
    }
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
    await expect(cell(page, '5:1')).toHaveCSS('border-bottom-style', 'double')
    await expect(cell(page, '5:1')).toHaveCSS('border-bottom-color', 'rgb(192, 0, 0)')
    await expect(cell(page, '5:1')).toHaveText(original!)
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B6')
    await button(page, 'Cancel').click()
    await expect(dialog).toHaveCount(0)
    await expect(button(page, 'Border settings')).toBeFocused()
    await expect(button(page, 'Undo')).toBeDisabled()
  })
