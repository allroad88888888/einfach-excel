import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
async function open(page: Page) {
  await button(page, 'Tables').click()
  await button(page, 'Edit table DemoTable').click()
  return page.getByRole('dialog', { name: 'Tables', exact: true })
}
async function close(page: Page) {
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog', { name: 'Tables', exact: true })).toHaveCount(0)
}
async function setFunction(page: Page, value: string) {
  await page.getByLabel('Total function', { exact: true }).selectOption(value)
  await button(page, 'Apply total').click()
  await expect(button(page, 'Apply total')).toBeEnabled()
  await expect(page.getByLabel('Total function', { exact: true })).toHaveValue(value)
}
async function input(page: Page, address: string, coord: string, value: string, display: string) {
  await select(page, address, coord)
  await formula(page).fill(value); await formula(page).press('Enter')
  await expect(cell(page, coord)).toHaveText(display)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '4:1')).toHaveText('60')
})

test('seed totals are real SUBTOTAL formulas with no startup history', async ({ page }) => {
  await expect(button(page, 'Undo')).toBeDisabled()
  await select(page, 'B84', '83:1')
  await expect(cell(page, '83:1')).toHaveText('60')
  await expect(formula(page)).toHaveValue('=SUBTOTAL(109,DemoTable[Amount])')
  await open(page)
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B84')
  await expect(page.getByLabel('Total function', { exact: true })).toHaveValue('sum')
  await page.getByLabel('Total column', { exact: true }).selectOption('Product')
  await expect(page.getByLabel('Total function', { exact: true })).toHaveValue('none')
})

test('show, choose and hide retain one native history entry per action', async ({ page }) => {
  await open(page); await button(page, 'Hide totals row').click()
  await expect(button(page, 'Show totals row')).toBeVisible()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B83')
  await button(page, 'Show totals row').click()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B84')
  await setFunction(page, 'average'); await close(page)
  await select(page, 'B84', '83:1')
  await expect(cell(page, '83:1')).toHaveText('20')
  await expect(formula(page)).toHaveValue('=SUBTOTAL(101,DemoTable[Amount])')
  await button(page, 'Undo').click(); await expect(cell(page, '83:1')).toHaveText('60')
  await button(page, 'Redo').click(); await expect(cell(page, '83:1')).toHaveText('20')
  await open(page); await button(page, 'Hide totals row').click(); await close(page)
  await expect(cell(page, '83:1')).toHaveText('')
  await button(page, 'Undo').click(); await expect(cell(page, '83:1')).toHaveText('20')
  await open(page)
  await expect(page.getByLabel('Total function', { exact: true })).toHaveValue('average')
})

test('totals stay live after edits and exclude manually hidden rows', async ({ page }) => {
  await open(page); await setFunction(page, 'average'); await close(page)
  await input(page, 'B81', '80:1', '40', '40')
  await select(page, 'B84', '83:1'); await expect(cell(page, '83:1')).toHaveText('30')
  await select(page, 'B82', '81:1')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-rows')
  await select(page, 'B84', '83:1'); await expect(cell(page, '83:1')).toHaveText('35')
  await button(page, 'Undo').click(); await expect(cell(page, '83:1')).toHaveText('30')
})

test('changing only the total function updates cross-sheet spills and their consumers', async ({ page }) => {
  // 真实空白表容纳五行数组，不让 demo 的既有内容挡住 spill。
  await button(page, 'New sheet').click()
  await expect(page.getByRole('tab', { name: 'Sheet3', exact: true })).toHaveAttribute('aria-selected', 'true')
  await input(page, 'A1', '0:0', '=DemoTable[#All]', 'Product')
  await expect(cell(page, '4:1')).toHaveText('60')
  await input(page, 'E1', '0:4', '=SUM(A1#)', '120')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await open(page); await setFunction(page, 'average'); await close(page)
  await page.getByRole('tab', { name: 'Sheet3', exact: true }).click()
  await expect(cell(page, '4:1')).toHaveText('20')
  await expect(cell(page, '0:4')).toHaveText('80')
  await button(page, 'Undo').click()
  await expect(cell(page, '4:1')).toHaveText('60')
  await expect(cell(page, '0:4')).toHaveText('120')
  await button(page, 'Redo').click()
  await expect(cell(page, '4:1')).toHaveText('20')
  await expect(cell(page, '0:4')).toHaveText('80')
})

test('custom total content is read from Rust and can be replaced or cleared', async ({ page }) => {
  await input(page, 'B84', '83:1', '=SUM(B81:B83)+1', '61')
  await open(page)
  await expect(page.getByLabel('Total function', { exact: true })).toHaveValue('custom')
  await expect(button(page, 'Apply total')).toBeDisabled()
  await setFunction(page, 'countNums'); await close(page)
  await expect(cell(page, '83:1')).toHaveText('3')
  await open(page); await setFunction(page, 'none'); await close(page)
  await expect(cell(page, '83:1')).toHaveText('')
  await button(page, 'Undo').click(); await expect(cell(page, '83:1')).toHaveText('3')
  await button(page, 'Undo').click(); await expect(cell(page, '83:1')).toHaveText('61')
})

test('occupied totals row rejects without overwrite or extra history and can be retried', async ({ page }) => {
  await open(page); await button(page, 'Hide totals row').click(); await close(page)
  await input(page, 'B84', '83:1', 'Keep this', 'Keep this')
  await open(page); await button(page, 'Show totals row').click()
  await expect(page.getByRole('alert')).toContainText(/occupied/i)
  await expect(button(page, 'Show totals row')).toBeEnabled()
  await close(page); await expect(cell(page, '83:1')).toHaveText('Keep this')
  await button(page, 'Undo').click(); await expect(cell(page, '83:1')).toHaveText('')
  await open(page); await button(page, 'Show totals row').click(); await close(page)
  await expect(cell(page, '83:1')).toHaveText('60')
})

test('totals cannot extend beyond the demo worksheet canvas', async ({ page }) => {
  await select(page, 'A100:B100', '99:0')
  await button(page, 'Tables').click()
  await page.getByLabel('Table name', { exact: true }).fill('LastRowTable')
  await button(page, 'Create table').click()
  await expect(page.getByRole('dialog', { name: 'Tables', exact: true })).toHaveCount(0)
  await button(page, 'Tables').click(); await button(page, 'Edit table LastRowTable').click()
  await button(page, 'Show totals row').click()
  await expect(page.getByRole('alert')).toContainText('outside this worksheet')
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A100:B100')
})

for (const width of [1280, 390]) test(`totals controls fit ${width}px and keep keyboard focus inside`, async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width, height: 800 })
  const dialog = await open(page)
  const box = (await dialog.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(800)
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  await dialog.getByRole('button').first().focus(); await page.keyboard.press('Shift+Tab')
  await expect(button(page, 'Apply total')).toBeFocused()
  await page.screenshot({ path: info.outputPath(`table-totals-${width}.png`) })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(button(page, 'Tables')).toBeFocused()
  expect(errors).toEqual([])
})
