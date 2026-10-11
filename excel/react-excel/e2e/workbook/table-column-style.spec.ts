import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function open(page: Page) {
  await button(page, 'Tables').click()
  await button(page, 'Edit table CalculatedOrders').click()
  return page.getByRole('dialog', { name: 'Tables', exact: true })
}
async function close(page: Page) {
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '5:1')).toHaveText('140')
  await select(page, 'A47', '46:0')
})

test('native seed shows column banding and last-column emphasis with no startup history', async ({ page }) => {
  await expect(button(page, 'Undo')).toBeDisabled()
  for (const row of [46, 47, 48]) {
    for (const col of [0, 2])
      await expect(cell(page, `${row}:${col}`)).toHaveCSS('background-color', 'rgb(226, 239, 218)')
    await expect(cell(page, `${row}:1`)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(cell(page, `${row}:0`)).toHaveCSS('font-weight', '400')
    await expect(cell(page, `${row}:2`)).toHaveCSS('font-weight', '700')
  }
  await open(page)
  await expect(page.getByLabel('Banded rows')).not.toBeChecked()
  await expect(page.getByLabel('Banded columns')).toBeChecked()
  await expect(page.getByLabel('Last column emphasis')).toBeChecked()
})

test('column options update independently and undo restores native metadata', async ({ page }) => {
  await open(page)
  await page.getByLabel('Banded columns').click()
  await expect(page.getByLabel('Banded columns')).not.toBeChecked()
  await expect(page.getByLabel('Banded columns')).toBeEnabled()
  await page.getByLabel('Last column emphasis').click()
  await expect(page.getByLabel('Last column emphasis')).not.toBeChecked()
  await expect(page.getByLabel('Last column emphasis')).toBeEnabled()
  await close(page)
  await expect(cell(page, '46:2')).toHaveCSS('font-weight', '400')
  await expect(cell(page, '46:0')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await button(page, 'Undo').click()
  await expect(cell(page, '46:2')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '46:0')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await button(page, 'Undo').click()
  await expect(cell(page, '46:0')).toHaveCSS('background-color', 'rgb(226, 239, 218)')
  await expect(button(page, 'Undo')).toBeDisabled()
  await open(page)
  await expect(page.getByLabel('Banded columns')).toBeChecked()
  await expect(page.getByLabel('Last column emphasis')).toBeChecked()
})

test('expanding the table moves emphasis to the new last column without changing formulas', async ({ page }) => {
  await select(page, 'D47', '46:3')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('7'); await formula.press('Enter')
  await expect(cell(page, '46:3')).toHaveText('7')
  await expect(cell(page, '46:3')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '46:2')).toHaveCSS('font-weight', '400')
  await expect(cell(page, '46:2')).toHaveText('10')
  await expect(cell(page, '46:3')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await button(page, 'Undo').click()
  await expect(cell(page, '46:3')).toHaveText('')
  await expect(cell(page, '46:2')).toHaveCSS('font-weight', '700')
  await button(page, 'Redo').click()
  await expect(cell(page, '46:3')).toHaveCSS('font-weight', '700')
})

for (const width of [1280, 390]) test(`column controls fit ${width}px and support keyboard toggling`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 800 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const dialog = await open(page)
  const option = page.getByLabel('Last column emphasis')
  await option.focus(); await page.keyboard.press('Space')
  await expect(option).toBeEnabled(); await expect(option).not.toBeChecked()
  await option.scrollIntoViewIfNeeded()
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  const bounds = (await dialog.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
  await page.screenshot({ path: info.outputPath(`table-columns-${width}.png`) })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(button(page, 'Tables')).toBeFocused()
  expect(errors).toEqual([])
})
