import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function open(page: Page) {
  await button(page, 'Tables').click(); await button(page, 'Edit table DemoTable').click()
  return page.getByRole('dialog', { name: 'Tables', exact: true })
}
async function close(page: Page) {
  await button(page, 'Cancel').click(); await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function preset(page: Page, value: string) {
  await page.getByLabel('Style preset', { exact: true }).selectOption(value)
  await expect(page.getByLabel('Style preset', { exact: true })).toBeEnabled()
  await expect(page.getByLabel('Style preset', { exact: true })).toHaveValue(value)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '4:1')).toHaveText('60')
  await select(page, 'A80', '79:0')
})

test('seed style is rendered by Rust without startup history', async ({ page }) => {
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(cell(page, '79:0')).toHaveCSS('background-color', 'rgb(31, 78, 120)')
  await expect(cell(page, '79:0')).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(cell(page, '80:1')).toHaveCSS('background-color', 'rgb(217, 232, 245)')
  await expect(cell(page, '81:1')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  for (const coord of ['79:0', '80:1', '81:1']) {
    const contrast = await cell(page, coord).evaluate((node) => {
      const luminance = (color: string) => {
        const values = color.match(/\d+/g)!.slice(0, 3).map(Number).map((value) => {
          const channel = value / 255
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        })
        return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722
      }
      const style = getComputedStyle(node)
      const foreground = luminance(style.color), background = luminance(style.backgroundColor)
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
  }
  await open(page)
  await expect(page.getByLabel('Style preset')).toHaveValue('blue')
  await expect(page.getByLabel('Banded rows')).toBeChecked()
  await expect(page.getByLabel('First column emphasis')).not.toBeChecked()
})

test('preset changes are one undo step and None removes only table styling', async ({ page }) => {
  await open(page); await preset(page, 'green'); await close(page)
  await expect(cell(page, '79:0')).toHaveCSS('background-color', 'rgb(39, 99, 71)')
  await button(page, 'Undo').click()
  await expect(cell(page, '79:0')).toHaveCSS('background-color', 'rgb(31, 78, 120)')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '79:0')).toHaveCSS('background-color', 'rgb(39, 99, 71)')
  await open(page); await preset(page, 'gray'); await close(page)
  await expect(cell(page, '79:0')).toHaveCSS('background-color', 'rgb(75, 85, 99)')
  await open(page); await preset(page, 'none')
  await expect(page.getByLabel('Banded rows')).toBeDisabled(); await close(page)
  await expect(cell(page, '79:0')).not.toHaveCSS('background-color', 'rgb(75, 85, 99)')
  await expect(cell(page, '79:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '80:1')).toHaveText('10')
})

test('banding and first-column emphasis are independent and reversible', async ({ page }) => {
  await open(page)
  await page.getByLabel('Banded rows').click()
  await expect(page.getByLabel('Banded rows')).not.toBeChecked()
  await expect(page.getByLabel('Banded rows')).toBeEnabled()
  await page.getByLabel('First column emphasis').click()
  await expect(page.getByLabel('First column emphasis')).toBeChecked()
  await expect(page.getByLabel('First column emphasis')).toBeEnabled(); await close(page)
  await expect(cell(page, '80:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '80:1')).toHaveCSS('font-weight', '400')
  await expect(cell(page, '80:1')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await button(page, 'Undo').click()
  await expect(cell(page, '80:0')).toHaveCSS('font-weight', '400')
  await expect(cell(page, '80:1')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await button(page, 'Undo').click()
  await expect(cell(page, '80:1')).toHaveCSS('background-color', 'rgb(217, 232, 245)')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('conversion keeps visible table colors and undo restores editable style metadata', async ({ page }) => {
  await open(page); await preset(page, 'green')
  await button(page, 'Convert to range').click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '79:0')).toHaveCSS('background-color', 'rgb(39, 99, 71)')
  await expect(cell(page, '80:1')).toHaveCSS('background-color', 'rgb(226, 239, 218)')
  await button(page, 'Undo').click(); await open(page)
  await expect(page.getByLabel('Style preset')).toHaveValue('green'); await close(page)
  await button(page, 'Redo').click()
  await expect(cell(page, '80:1')).toHaveCSS('background-color', 'rgb(226, 239, 218)')
  await select(page, 'B5', '4:1'); await expect(cell(page, '4:1')).toHaveText('60')
})

for (const width of [1280, 390]) test(`style controls fit ${width}px with keyboard access`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 800 })
  const dialog = await open(page)
  await page.getByLabel('First column emphasis').focus(); await page.keyboard.press('Space')
  await expect(page.getByLabel('First column emphasis')).toBeEnabled()
  await expect(page.getByLabel('First column emphasis')).toBeChecked()
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  const bounds = (await dialog.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
  await page.getByLabel('Style preset').scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath(`table-style-${width}.png`) })
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  await expect(button(page, 'Tables')).toBeFocused()
  await page.screenshot({ path: info.outputPath(`table-style-grid-${width}.png`) })
  expect(errors).toEqual([])
})
