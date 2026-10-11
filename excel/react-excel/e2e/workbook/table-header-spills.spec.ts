import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function input(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill(value)
  await formula.press('Enter')
  await expect(formula).toBeEnabled()
}
async function headers(page: Page, enabled: boolean) {
  await button(page, 'Tables').click()
  await button(page, 'Edit table Orders').click()
  await page.getByLabel('Header row', { exact: true }).click()
  await expect(page.getByLabel('Header row', { exact: true })).toBeChecked({ checked: enabled })
  await expect(page.getByLabel('Header row', { exact: true })).toBeEnabled()
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('header insertion moves array formulas rather than freezing their children as values', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await button(page, 'New sheet').click()
  await expect(page.getByRole('tab', { name: 'Sheet3', exact: true })).toHaveAttribute('aria-selected', 'true')
  for (const [address, coord, value] of [
    ['B1', '0:1', 'Qty'], ['C1', '0:2', 'Tax'], ['B2', '1:1', '2'], ['B3', '2:1', '3'],
  ]) await input(page, address, coord, value)
  await select(page, 'B1:C3', '0:1')
  await button(page, 'Tables').click()
  await page.getByLabel('Table name', { exact: true }).fill('Orders')
  await button(page, 'Create table').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await headers(page, false)
  await input(page, 'B1', '0:1', 'Occupied')
  await input(page, 'B6', '5:1', '=SEQUENCE(B2,2,10)')
  await input(page, 'F1', '0:5', '=SUM(B6:C7)')
  await expect(cell(page, '6:2')).toHaveText('13')
  await headers(page, true)
  await expect(cell(page, '7:2')).toHaveText('13')
  await expect(cell(page, '5:1')).toHaveText('')
  await expect(cell(page, '0:5')).toHaveText('46')
  await button(page, 'Undo').click()
  await expect(cell(page, '6:2')).toHaveText('13')
  await expect(cell(page, '7:2')).toHaveText('')
  await button(page, 'Redo').click()
  await expect(cell(page, '7:2')).toHaveText('13')
  await input(page, 'B3', '2:1', '3')
  await expect(cell(page, '8:2')).toHaveText('15')
  await input(page, 'B3', '2:1', '1')
  await expect(cell(page, '6:2')).toHaveText('11')
  await expect(cell(page, '7:2')).toHaveText('')
  await expect(cell(page, '8:2')).toHaveText('')
  expect(errors).toEqual([])
})

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} saves moved array sources and restores live cross-sheet children`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    const reference = new module.WasmWorkbook()
    try {
      for (const [address, value] of [['B1', 'Qty'], ['C1', 'Tax'], ['B2', '2'], ['B3', '3']])
        book.set_cell_input(0, address, value)
      book.change_table(0, { kind: 'create', name: 'Orders', range: [0, 1, 2, 2] })
      book.change_table(0, { kind: 'header-row', name: 'Orders', enabled: false })
      book.set_cell_input(0, 'B1', 'Occupied')
      book.set_cell_input(0, 'B6', '=SEQUENCE(B2,2,10)')
      book.set_cell_input(0, 'B10', '=IF(ROW()=10,1,SEQUENCE(2,2))')
      book.add_sheet('Report')
      book.set_cell_input(1, 'A1', '=Sheet1!B6:C7')
      const before = JSON.stringify(book.snapshot_persistence_v1())
      book.change_table(0, { kind: 'header-row', name: 'Orders', enabled: true, rowCount: 100 })
      const after = JSON.stringify(book.snapshot_persistence_v1())
      const expanded = book.get_number(0, 'C12')
      book.history_apply('undo')
      const exactUndo = JSON.stringify(book.snapshot_persistence_v1()) === before
      const cleared = book.get_display(0, 'C12')
      book.history_apply('redo')
      const exactRedo = JSON.stringify(book.snapshot_persistence_v1()) === after
      restored.restore_persistence_v1(JSON.parse(after))
      const child = restored.get_number(1, 'B2')
      const cleanHistory = !restored.history_apply('undo')
      restored.set_cell_input(0, 'B3', '3')
      const grown = restored.get_number(0, 'C9')
      restored.set_cell_input(0, 'B3', '1')
      const shrunk = restored.get_display(0, 'C9')
      const consumer = restored.get_display(1, 'B2')
      // 对照未发生腾位的普通范围引用，空值显示语义不能由本用例擅自改成数值 0。
      reference.set_cell_input(0, 'E1', '2')
      reference.set_cell_input(0, 'B6', '=SEQUENCE(E1,2,10)')
      reference.add_sheet('Report')
      reference.set_cell_input(1, 'A1', '=Sheet1!B6:C7')
      reference.set_cell_input(0, 'E1', '1')
      const referenceConsumer = reference.get_display(1, 'B2')
      // 非法切开数组必须保留内容和目录，不能先改表头再报错。
      restored.change_table(0, { kind: 'header-row', name: 'Orders', enabled: false })
      restored.set_cell_input(0, 'B2', 'Occupied again')
      restored.set_cell_input(0, 'C20', '=SEQUENCE(2,2)')
      const stable = JSON.stringify(restored.snapshot_persistence_v1())
      let rejected = false
      try {
        restored.change_table(0, { kind: 'header-row', name: 'Orders', enabled: true, rowCount: 100 })
      } catch { rejected = true }
      return { exactUndo, exactRedo, expanded, cleared, child, cleanHistory, grown, shrunk,
        consumer, referenceConsumer, rejected,
        unchanged: JSON.stringify(restored.snapshot_persistence_v1()) === stable }
    } finally { book.free(); restored.free(); reference.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ exactUndo: true, exactRedo: true, expanded: 4, cleared: '', child: 13,
    cleanHistory: true, grown: 15, shrunk: '', consumer: '', referenceConsumer: '',
    rejected: true, unchanged: true })
})
