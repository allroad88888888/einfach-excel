import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
async function edit(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await page.locator('[data-workbook-grid]').press('F2')
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill(value)
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('clear-all is one undo step restoring raw values, formula sources and formats', async ({
  page,
}) => {
  await button(page, 'Select row 2').click()
  await button(page, 'Clear all').click()
  await expect(cell(page, '1:0')).toHaveText('')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '400')
  await button(page, 'Undo').click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
  await select(page, 'G2', '1:6')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E2*F2')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '1:6')).toHaveText('')
  await expect(cell(page, '2:0')).toHaveText('SO-10002')
})

test('row formatting undo restores crossing column style without changing another row', async ({
  page,
}) => {
  await page.getByRole('columnheader', { name: 'Select column B', exact: true }).click()
  await button(page, 'Bold').click()
  await expect(cell(page, '2:1')).toHaveCSS('font-weight', '700')
  await button(page, 'Select row 3').click()
  // 行范围从 A3 的非粗体开始；先统一开粗体，再关粗体。
  await button(page, 'Bold').click()
  await expect(cell(page, '2:0')).toHaveCSS('font-weight', '700')
  await button(page, 'Bold').click()
  await expect(cell(page, '2:1')).toHaveCSS('font-weight', '400')
  await button(page, 'Undo').click()
  await expect(cell(page, '2:1')).toHaveCSS('font-weight', '700')
  await button(page, 'Undo').click()
  await expect(cell(page, '2:0')).toHaveCSS('font-weight', '400')
  await expect(cell(page, '2:1')).toHaveCSS('font-weight', '700')
  await button(page, 'Redo').click()
  await expect(cell(page, '2:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '3:1')).toHaveCSS('font-weight', '700')
})

test('reset-size undo restores Summary initial dimensions and aligned headers', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
  await select(page, 'A1', '0:0')
  await button(page, 'Row and column size').click()
  await button(page, 'Reset selected sizes').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())!.width).toBe(120)
  await button(page, 'Undo').click()
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())!.width).toBe(200)
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())!.height).toBe(40)
  await expect.poll(async () => (await button(page, 'Select row 1').boundingBox())!.height).toBe(40)
  await button(page, 'Redo').click()
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())!.height).toBe(28)
  await expect.poll(async () => (await cell(page, '0:0').boundingBox())!.width).toBe(120)
})

test('percent input undo restores raw text and a new edit discards redo', async ({ page }) => {
  await edit(page, 'A4', '3:0', '12.50%')
  await expect(cell(page, '3:0')).toHaveText('12.50%')
  await button(page, 'Undo').click()
  await expect(cell(page, '3:0')).toHaveText('00123')
  await select(page, 'A4', '3:0')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue("'00123")
  await button(page, 'Redo').click()
  await expect(cell(page, '3:0')).toHaveText('12.50%')
  await button(page, 'Undo').click()
  await expect(cell(page, '3:0')).toHaveText('00123')
  await edit(page, 'A4', '3:0', "'00123")
  await expect(button(page, 'Redo')).toBeEnabled()
  await edit(page, 'A4', '3:0', 'Different')
  await expect(cell(page, '3:0')).toHaveText('Different')
  await expect(button(page, 'Redo')).toBeDisabled()
  await button(page, 'Undo').click()
  await expect(cell(page, '3:0')).toHaveText('00123')
})
