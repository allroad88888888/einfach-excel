import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
async function input(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await formula(page).fill(value)
  await formula(page).press('Enter')
  await expect(formula(page)).toHaveValue(value)
}
async function save(page: Page, action: string) {
  await button(page, action).click()
  await expect(page.getByRole('dialog', { name: 'Tables', exact: true })).toHaveCount(0)
}
async function editSeed(page: Page) {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await button(page, 'Tables').click()
  await button(page, 'Edit table DemoTable').click()
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('table changes preserve live cross-sheet consumers through undo and redo', async ({ page }) => {
  await input(page, 'J2', '1:9', '=SUM(DemoTable[Amount])')
  await expect(cell(page, '1:9')).toHaveText('60')
  // 当前表的目录不混入其他工作表的 Table。
  await button(page, 'Tables').click()
  await expect(button(page, 'Edit table DemoTable')).toHaveCount(0)
  await save(page, 'Cancel')
  await editSeed(page)
  await page.getByLabel('Table name', { exact: true }).fill('RenamedAmounts')
  await save(page, 'Rename table')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'J2', '1:9')
  await expect(formula(page)).toHaveValue('=SUM(RenamedAmounts[Amount])')
  await expect(cell(page, '1:9')).toHaveText('60')
  await button(page, 'Undo').click()
  await expect(formula(page)).toHaveValue('=SUM(DemoTable[Amount])')
  await button(page, 'Redo').click()
  await expect(formula(page)).toHaveValue('=SUM(RenamedAmounts[Amount])')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await button(page, 'Tables').click()
  await button(page, 'Edit table RenamedAmounts').click()
  await save(page, 'Convert to range')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'J2', '1:9')
  const converted = await formula(page).inputValue()
  expect(converted).toMatch(/Summary.*\$?B\$?81:.*\$?B\$?83/)
  expect(converted).not.toContain('RenamedAmounts')
  await expect(cell(page, '1:9')).toHaveText('60')
  await button(page, 'Undo').click()
  await expect(formula(page)).toHaveValue('=SUM(RenamedAmounts[Amount])')
  await button(page, 'Redo').click()
  await expect(formula(page)).toHaveValue(converted)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await input(page, 'B81', '80:1', '40')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await select(page, 'J2', '1:9')
  await expect(cell(page, '1:9')).toHaveText('90')
})

test('header normalization is visible and undo restores the original formula and blank cells', async ({ page }) => {
  // 新建真实空白表，避免示例数据或隐藏列改变本用例的前置条件。
  await button(page, 'New sheet').click()
  await expect(page.getByRole('tab', { name: 'Sheet3', exact: true })).toHaveAttribute('aria-selected', 'true')
  await input(page, 'D90', '89:3', 'Amount')
  await input(page, 'E90', '89:4', 'Amount')
  await input(page, 'G90', '89:6', '=2+3')
  await select(page, 'D90:G92', '89:3')
  await button(page, 'Tables').click()
  await page.getByLabel('Table name', { exact: true }).fill('NormalizedHeaders')
  await save(page, 'Create table')
  for (const [coord, text] of [['89:3', 'Amount'], ['89:4', 'Column1'],
    ['89:5', 'Column2'], ['89:6', '5']]) await expect(cell(page, coord)).toHaveText(text)
  await select(page, 'G90', '89:6')
  // 列名是文本；编辑入口保留前导引号，不能重新解释成数字或公式。
  await expect(formula(page)).toHaveValue("'5")
  await button(page, 'Undo').click()
  await expect(formula(page)).toHaveValue('=2+3')
  await expect(cell(page, '89:4')).toHaveText('Amount')
  await expect(cell(page, '89:5')).toHaveText('')
  await button(page, 'Redo').click()
  await expect(formula(page)).toHaveValue("'5")
  await expect(cell(page, '89:4')).toHaveText('Column1')
  await expect(cell(page, '89:5')).toHaveText('Column2')
})
