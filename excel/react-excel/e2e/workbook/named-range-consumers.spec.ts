import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function rename(page: Page, old: string, next: string) {
  await button(page, 'Name manager').click()
  await button(page, `Edit ${old}`).click()
  await page.getByLabel('Name', { exact: true }).fill(next)
  await button(page, 'Save changes').click()
  await expect(page.getByRole('dialog', { name: 'Name manager' })).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('legal address-shaped and dotted names calculate and survive structural edits', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  let previous = 'SampleAmounts'
  for (const name of ['Sales1', 'Sales.', 'Sales..Quarter', 'XFE1', 'A1048577', 'A1..A2', '销售额']) {
    await rename(page, previous, name)
    await expect(cell(page, '3:1')).toHaveText('12')
    await select(page, 'B4', '3:1')
    await expect(page.getByRole('textbox', { name: 'Active cell value' }))
      .toHaveValue(`=SUM(${name})`)
    previous = name
  }
  await select(page, 'C65', '64:2')
  await page.getByRole('combobox', { name: 'Insert or delete rows and columns' })
    .selectOption('insert-rows')
  await select(page, 'B4', '3:1')
  await expect(cell(page, '3:1')).toHaveText('12')
  await button(page, 'Name manager').click(); await button(page, 'Edit 销售额').click()
  await expect(page.getByLabel('Refers to', { exact: true })).toHaveValue('C66:C68')
  await button(page, 'Cancel').click()
  await button(page, 'Undo').click(); await button(page, 'Undo').click()
  await expect(cell(page, '3:1')).toHaveText('12')
})

test('conditional formulas follow a rename and undo restores their original text', async ({ page }) => {
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'B4', '3:1')
  await button(page, 'Conditional formatting').click()
  await page.getByLabel('Rule type').selectOption('formula')
  await page.getByLabel('Formula', { exact: true }).fill('=SUM(SampleAmounts)>10')
  await button(page, 'Add rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(cell(page, '3:1')).toHaveCSS('background-color', 'rgb(255, 199, 206)')
  await rename(page, 'SampleAmounts', 'Revenue')
  await expect(cell(page, '3:1')).toHaveCSS('background-color', 'rgb(255, 199, 206)')
  await button(page, 'Conditional formatting').click(); await button(page, 'Edit rule 1').click()
  await expect(page.getByLabel('Formula', { exact: true })).toHaveValue(/SUM\(Revenue\)/)
  await button(page, 'Cancel').click(); await button(page, 'Undo').click()
  await button(page, 'Conditional formatting').click(); await button(page, 'Edit rule 1').click()
  await expect(page.getByLabel('Formula', { exact: true })).toHaveValue('=SUM(SampleAmounts)>10')
  await button(page, 'Cancel').click()
  await expect(cell(page, '3:1')).toHaveCSS('background-color', 'rgb(255, 199, 206)')
})

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} stored lambda stays live after rename and undo`, async ({ page }) => {
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook()
    try {
      book.set_cell_input(0, 'A1', '30')
      book.change_named_range(0, { kind: 'create', name: 'Sales',
        target: { sheet: 0, range: [0, 0, 0, 0] } })
      book.defineName('Compute', '=LET(Total,7,LAMBDA(x,SUM(Sales)+Total+x))')
      book.defineName('GlobalOnly', '=LAMBDA(SUM(Sales))')
      book.set_cell_input(0, 'C1', '=Compute(0)')
      book.set_cell_input(0, 'C2', '=LET(Total,99,GlobalOnly())')
      const before = book.get_number(0, 'C1')
      book.change_named_range(0, { kind: 'update', name: 'Sales', newName: 'Total' })
      const after = book.get_number(0, 'C1')
      const lexical = book.get_number(0, 'C2')
      const undo = book.history_apply('undo')
      const reverted = book.get_number(0, 'C1')
      const redo = book.history_apply('redo')
      book.set_cell_input(0, 'A1', '50')
      return { before, after, lexical, undo, reverted, redo, changed: book.get_number(0, 'C1') }
    } finally { book.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ before: 37, after: 37, lexical: 30,
    undo: true, reverted: 37, redo: true, changed: 57 })
})
