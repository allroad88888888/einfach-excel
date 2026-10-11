import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
async function open(page: Page) {
  await button(page, 'Tables').click(); await button(page, 'Edit table DemoTable').click()
}
async function close(page: Page) {
  await button(page, 'Cancel').click(); await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function assertRange(page: Page, range: string) {
  await open(page); await expect(page.getByLabel('Table range', { exact: true })).toHaveValue(range)
  await close(page)
}
async function input(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await formula(page).fill(value); await formula(page).press('Enter')
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '4:1')).toHaveText('60')
})

for (const source of ['cell', 'formula'] as const) test(`${source} input below data expands a row with one undo`, async ({ page }) => {
  await open(page); await button(page, 'Hide totals row').click()
  await expect(button(page, 'Show totals row')).toBeVisible(); await close(page)
  await select(page, 'B84', '83:1')
  if (source === 'cell') await page.locator('[data-workbook-grid]').press('F2')
  const editor = source === 'cell' ? page.getByRole('textbox', { name: 'Cell editor', exact: true }) : formula(page)
  await editor.fill('40'); await editor.press('Enter')
  await expect(cell(page, '83:1')).toHaveText('40')
  await assertRange(page, 'A80:B84')
  await select(page, 'B5', '4:1'); await expect(cell(page, '4:1')).toHaveText('100')
  await button(page, 'Undo').click(); await expect(cell(page, '4:1')).toHaveText('60')
  await assertRange(page, 'A80:B83')
  await select(page, 'B84', '83:1'); await expect(cell(page, '83:1')).toHaveText('')
  await button(page, 'Redo').click(); await expect(cell(page, '83:1')).toHaveText('40')
  await assertRange(page, 'A80:B84')
})

test('typing beside the body creates a column and evaluates row references immediately', async ({ page }) => {
  await input(page, 'C81', '80:2', '=[@Amount]*2')
  await expect(cell(page, '80:2')).toHaveText('20')
  await assertRange(page, 'A80:C84')
  await select(page, 'C80', '79:2'); await expect(cell(page, '79:2')).toHaveText('Column1')
  await button(page, 'Undo').click(); await expect(cell(page, '79:2')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
  await assertRange(page, 'A80:B84')
  await select(page, 'C81', '80:2'); await expect(cell(page, '80:2')).toHaveText('')
  await button(page, 'Redo').click(); await expect(cell(page, '80:2')).toHaveText('20')
  await assertRange(page, 'A80:C84')
})

test('new header text is literal and the cross-sheet table array grows and shrinks', async ({ page }) => {
  await button(page, 'New sheet').click()
  await input(page, 'A1', '0:0', '=DemoTable[#All]')
  await expect(cell(page, '0:0')).toHaveText('Product')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await input(page, 'C80', '79:2', '=1+1'); await expect(cell(page, '79:2')).toHaveText('=1+1')
  await assertRange(page, 'A80:C84')
  await page.getByRole('tab', { name: 'Sheet3', exact: true }).click()
  await expect(cell(page, '0:2')).toHaveText('=1+1')
  await button(page, 'Undo').click(); await expect(cell(page, '0:2')).toHaveText('')
  await button(page, 'Redo').click(); await expect(cell(page, '0:2')).toHaveText('=1+1')
})

test('failed expanding input keeps the same draft and does not consume redo', async ({ page }) => {
  await input(page, 'C81', '80:2', '40'); await expect(cell(page, '80:2')).toHaveText('40')
  await button(page, 'Undo').click()
  await select(page, 'C81', '80:2'); await formula(page).fill('=SUM('); await formula(page).press('Enter')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(formula(page)).toHaveValue('=SUM(')
  await formula(page).press('Escape'); await assertRange(page, 'A80:B84')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click(); await assertRange(page, 'A80:C84')
  await select(page, 'C81', '80:2'); await expect(cell(page, '80:2')).toHaveText('40')
})
