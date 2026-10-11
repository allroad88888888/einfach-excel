import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, row: number, col = 2) => page.locator(`td[data-cell="${row}:${col}"]`)
const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
async function input(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await formula(page).fill(value)
  await formula(page).press('Enter')
}
async function values(page: Page, expected: string[]) {
  await select(page, 'C81', '80:2')
  for (let i = 0; i < expected.length; i += 1)
    await expect(cell(page, 80 + i)).toHaveText(expected[i])
}
async function openTable(page: Page) {
  await button(page, 'Tables').click()
  await button(page, 'Edit table DemoTable').click()
}
async function closeTable(page: Page) {
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
async function range(page: Page, expected: string) {
  await openTable(page)
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue(expected)
  await closeTable(page)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, 1, 0)).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, 4, 1)).toHaveText('60')
})

test('middle-row formula fills above and below, with one undo for the whole column', async ({ page }) => {
  await input(page, 'C82', '81:2', '=[@Amount]*2')
  await values(page, ['20', '40', '60'])
  await range(page, 'A80:C84')
  await select(page, 'C83', '82:2')
  await expect(formula(page)).toHaveValue(/\[@Amount\].*2/)
  await button(page, 'Undo').click()
  await values(page, ['', '', ''])
  await range(page, 'A80:B84')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await values(page, ['20', '40', '60'])
  await range(page, 'A80:C84')
})

test('editing a calculated cell updates the whole column and preserves its previous formula on undo',
  async ({ page }) => {
    await input(page, 'C82', '81:2', '=[@Amount]*2')
    await values(page, ['20', '40', '60'])
    await input(page, 'C83', '82:2', '=[@Amount]*3')
    await values(page, ['30', '60', '90'])
    await button(page, 'Undo').click()
    await values(page, ['20', '40', '60'])
    await expect(formula(page)).toHaveValue(/\[@Amount\].*2/)
    await button(page, 'Redo').click()
    await values(page, ['30', '60', '90'])
    await expect(formula(page)).toHaveValue(/\[@Amount\].*3/)
  })

test('typing below the table inherits the calculated column in the same undo step', async ({ page }) => {
  await openTable(page)
  await button(page, 'Hide totals row').click()
  await expect(button(page, 'Show totals row')).toBeVisible()
  await closeTable(page)
  await input(page, 'C82', '81:2', '=[@Amount]*2')
  await values(page, ['20', '40', '60'])
  await input(page, 'B84', '83:1', '40')
  await values(page, ['20', '40', '60', '80'])
  await range(page, 'A80:C84')
  await button(page, 'Undo').click()
  await values(page, ['20', '40', '60', ''])
  await expect(cell(page, 83, 1)).toHaveText('')
  await range(page, 'A80:C83')
  await button(page, 'Redo').click()
  await values(page, ['20', '40', '60', '80'])
  await expect(cell(page, 83, 1)).toHaveText('40')
  await range(page, 'A80:C84')
})

test('seed calculated formulas are native, editable, inheritable and absent from startup history',
  async ({ page }) => {
    await expect(cell(page, 5, 1)).toHaveText('140')
    await expect(button(page, 'Undo')).toBeDisabled()
    await select(page, 'C47', '46:2')
    for (const [row, value] of [[46, '10'], [47, '40'], [48, '90']] as const)
      await expect(cell(page, row)).toHaveText(value)
    await expect(formula(page)).toHaveValue(/\[@Quantity\].*\[@Price\]/)
    await input(page, 'C48', '47:2', '=[@Quantity]*[@Price]*2')
    for (const [row, value] of [[46, '20'], [47, '80'], [48, '180']] as const)
      await expect(cell(page, row)).toHaveText(value)
    await input(page, 'B50', '49:1', '50')
    await expect(cell(page, 49)).toHaveText('0')
    await input(page, 'A50', '49:0', '4')
    await expect(cell(page, 49)).toHaveText('400')
    await button(page, 'Undo').click()
    await expect(cell(page, 49)).toHaveText('0')
  })

test('manual exception prevents later formula input from overwriting other rows', async ({ page }) => {
  await input(page, 'C82', '81:2', '=[@Amount]*2')
  await values(page, ['20', '40', '60'])
  await input(page, 'C82', '81:2', '99')
  await input(page, 'C81', '80:2', '=[@Amount]*3')
  await values(page, ['30', '99', '60'])
  await button(page, 'Undo').click()
  await values(page, ['20', '99', '60'])
  await button(page, 'Undo').click()
  await values(page, ['20', '40', '60'])
})

test('inserting a row inherits the native formula and undo restores all moved rows', async ({ page }) => {
  await input(page, 'C82', '81:2', '=[@Amount]*2')
  await select(page, 'B82', '81:1')
  const menu = page.getByRole('combobox', { name: 'Insert or delete rows and columns' })
  await menu.selectOption('insert-rows')
  await expect(menu).toBeEnabled()
  await expect(menu).toHaveValue('')
  await values(page, ['20', '0', '40', '60'])
  await select(page, 'C82', '81:2')
  await expect(formula(page)).toHaveValue(/\[@Amount\].*2/)
  await button(page, 'Undo').click()
  await values(page, ['20', '40', '60'])
  await button(page, 'Redo').click()
  await values(page, ['20', '0', '40', '60'])
})

test('a fully cleared calculated column accepts a new whole-column formula', async ({ page }) => {
  await select(page, 'C47:C49', '46:2')
  await page.locator('[data-workbook-grid]').press('Delete')
  for (const row of [46, 47, 48]) await expect(cell(page, row)).toHaveText('')
  await input(page, 'C48', '47:2', '=[@Quantity]*[@Price]*3')
  for (const [row, value] of [[46, '30'], [47, '120'], [48, '270']] as const)
    await expect(cell(page, row)).toHaveText(value)
  await button(page, 'Undo').click()
  for (const row of [46, 47, 48]) await expect(cell(page, row)).toHaveText('')
  await button(page, 'Undo').click()
  for (const [row, value] of [[46, '10'], [47, '40'], [48, '90']] as const)
    await expect(cell(page, row)).toHaveText(value)
})

for (const formulaRows of [2, 3]) test(`a partially cleared column rejects a ${formulaRows}-row array`,
  async ({ page }) => {
    await select(page, 'C48', '47:2')
    await page.locator('[data-workbook-grid]').press('Delete')
    await expect(cell(page, 47)).toHaveText('')
    await input(page, 'C47', '46:2', `=SEQUENCE(${formulaRows})`)
    await expect(page.getByRole('alert')).toContainText('Spilled arrays')
    await expect(formula(page)).toHaveValue(`=SEQUENCE(${formulaRows})`)
    await formula(page).press('Escape')
    await expect(cell(page, 46)).toHaveText('10')
    await expect(cell(page, 47)).toHaveText('')
    await expect(cell(page, 48)).toHaveText('90')
    // 拒绝未消费历史：撤销的仍是刚才清空 C48 的动作。
    await button(page, 'Undo').click()
    await expect(cell(page, 47)).toHaveText('40')
    await expect(button(page, 'Undo')).toBeDisabled()
  })
