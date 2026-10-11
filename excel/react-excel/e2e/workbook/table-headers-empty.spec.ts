import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function open(page: Page) {
  await button(page, 'Tables').click()
  await button(page, 'Edit table DemoTable').click()
}
async function close(page: Page) {
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test('a table with only headers and totals can hide headers without absorbing a data row', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  // 缩表会搬移汇总；先用真实清空操作腾出目的行，不绕过已有的防覆盖校验。
  await select(page, 'A81:B81', '80:0')
  await page.keyboard.press('Delete')
  await expect(cell(page, '80:0')).toHaveText('')
  await expect(cell(page, '80:1')).toHaveText('')
  await open(page)
  await page.getByLabel('Table range', { exact: true }).fill('A80:B81')
  await button(page, 'Resize table').click()
  await expect(button(page, 'Edit table DemoTable')).toContainText('A80:B81')
  await close(page)
  await select(page, 'B81', '80:1')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('99'); await formula.press('Enter')
  await expect(cell(page, '80:1')).toHaveText('99')
  await select(page, 'B82', '81:1')
  const outside = await cell(page, '81:1').textContent()
  await open(page)
  await page.getByLabel('Header row', { exact: true }).click()
  await expect(page.getByLabel('Header row', { exact: true })).not.toBeChecked()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A81:B81')
  await expect(page.getByLabel('Header row', { exact: true })).toBeEnabled()
  await button(page, 'Hide totals row').click()
  await expect(button(page, 'Show totals row')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A81:B81')
  await close(page)
  await select(page, 'B80', '79:1')
  await expect(cell(page, '79:1')).toHaveText('')
  await expect(cell(page, '80:1')).toHaveText('')
  await expect(cell(page, '81:1')).toHaveText(outside ?? '')
  // 最后一行现在是输入位置；真实编辑创建一条记录，撤销回到空表，再撤销恢复汇总。
  await select(page, 'B81', '80:1')
  await formula.fill('7'); await formula.press('Enter')
  await expect(cell(page, '80:1')).toHaveText('7')
  await button(page, 'Undo').click()
  await expect(cell(page, '80:1')).toHaveText('')
  await button(page, 'Undo').click()
  await expect(cell(page, '80:1')).toHaveText('99')
  await button(page, 'Undo').click()
  await expect(cell(page, '79:1')).toHaveText('Amount')
  await expect(cell(page, '80:1')).toHaveText('99')
  await button(page, 'Redo').click()
  await expect(cell(page, '79:1')).toHaveText('')
  await open(page)
  await page.getByLabel('Header row', { exact: true }).click()
  await expect(page.getByLabel('Header row', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B81')
  await close(page)
  await expect(cell(page, '79:1')).toHaveText('Amount')
  await expect(cell(page, '80:1')).toHaveText('99')
  expect(errors).toEqual([])
})

test('a header-only table keeps an editable position and does not move neighboring cells', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'B81', '80:1')
  const outside = await cell(page, '80:1').textContent()
  await open(page)
  await button(page, 'Hide totals row').click()
  await expect(button(page, 'Show totals row')).toBeVisible()
  await page.getByLabel('Table range', { exact: true }).fill('A80:B80')
  await button(page, 'Resize table').click()
  await expect(button(page, 'Edit table DemoTable')).toContainText('A80:B80')
  const headers = page.getByLabel('Header row', { exact: true })
  await headers.click()
  await expect(headers).not.toBeChecked()
  await expect(headers).toBeEnabled()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B80')
  await headers.click()
  await expect(headers).toBeChecked()
  await expect(headers).toBeEnabled()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B80')
  await close(page)
  await expect(cell(page, '79:1')).toHaveText('Amount')
  await expect(cell(page, '80:1')).toHaveText(outside ?? '')
  await button(page, 'Undo').click()
  await expect(cell(page, '79:1')).toHaveText('')
  await select(page, 'B80', '79:1')
  const formula = page.getByRole('textbox', { name: 'Active cell value' })
  await formula.fill('7'); await formula.press('Enter')
  await expect(cell(page, '79:1')).toHaveText('7')
  await button(page, 'Undo').click()
  await expect(cell(page, '79:1')).toHaveText('')
  await button(page, 'Redo').click()
  await expect(cell(page, '79:1')).toHaveText('7')
  await expect(cell(page, '80:1')).toHaveText(outside ?? '')
})

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} distinguishes an empty input position from one blank data record`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const source = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      source.set_cell_input(0, 'A4', 'Outside')
      source.add_sheet('Report')
      source.set_cell_input(1, 'D1', '=ROWS(Orders[Amount])')
      const snapshot = source.snapshot_persistence_v1()
      snapshot.tables = [{ name: 'Orders', sheet: 'Sheet1', sheetIndex: 0, range: 'A3:B3',
        hasHeaders: false, hasTotals: false, columns: ['Item', 'Amount'], insertRow: true }]
      restored.restore_persistence_v1(JSON.parse(JSON.stringify(snapshot)))
      const empty = restored.get_display(1, 'D1')
      const saved = restored.snapshot_persistence_v1()
      const insertRow = saved.tables[0].insertRow
      restored.restore_persistence_v1(JSON.parse(JSON.stringify(saved)))
      const roundtrip = restored.get_display(1, 'D1')
      delete saved.tables[0].insertRow
      restored.restore_persistence_v1(saved)
      const blankRecord = restored.get_number(1, 'D1')
      const stable = JSON.stringify(restored.snapshot_persistence_v1())
      saved.tables[0].insertRow = true
      saved.tables[0].range = 'A3:B4'
      let rejected = false
      try { restored.restore_persistence_v1(saved) } catch { rejected = true }
      return { empty, insertRow, roundtrip, blankRecord, rejected,
        unchanged: JSON.stringify(restored.snapshot_persistence_v1()) === stable,
        outside: restored.get_display(0, 'A4') }
    } finally { source.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ empty: '#REF!', insertRow: true, roundtrip: '#REF!', blankRecord: 1,
    rejected: true, unchanged: true, outside: 'Outside' })
})

for (const variant of ['lite', 'full']) test(`${variant} restores a zero-data table with live references and exact header history`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      book.set_cell_input(0, 'A1', 'Item'); book.set_cell_input(0, 'B1', 'Amount')
      book.change_table(0, { kind: 'create', name: 'Orders', range: [0, 0, 0, 1] })
      book.change_table(0, { kind: 'totals-row', name: 'Orders', enabled: true, rowCount: 100 })
      book.set_cell_input(0, 'B2', '99')
      book.set_cell_input(0, 'A3', 'Outside')
      book.add_sheet('Report')
      book.set_cell_input(1, 'A1', '=Orders[Amount]')
      book.set_cell_input(1, 'A2', '=Orders[[#Totals],[Amount]]')
      const before = JSON.stringify(book.snapshot_persistence_v1())
      book.change_table(0, { kind: 'header-row', name: 'Orders', enabled: false })
      const hidden = JSON.stringify(book.snapshot_persistence_v1())
      book.history_apply('undo')
      const exactUndo = JSON.stringify(book.snapshot_persistence_v1()) === before
      book.history_apply('redo')
      const exactRedo = JSON.stringify(book.snapshot_persistence_v1()) === hidden
      restored.restore_persistence_v1(JSON.parse(hidden))
      const data = restored.get_display(1, 'A1'), total = restored.get_number(1, 'A2')
      const cleanHistory = !restored.history_apply('undo')
      const table = restored.listTables()[0]
      restored.change_table(0, { kind: 'header-row', name: 'Orders', enabled: true })
      const shown = restored.listTables()[0]
      restored.set_cell_input(0, 'B2', '123')
      return { exactUndo, exactRedo, cleanHistory, data, total, table, shown,
        updated: restored.get_number(1, 'A2'), stillEmpty: restored.get_display(1, 'A1'),
        outside: restored.get_display(0, 'A3') }
    } finally { book.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toMatchObject({ exactUndo: true, exactRedo: true, cleanHistory: true,
    data: '#REF!', total: 99, updated: 123, stillEmpty: '#REF!', outside: 'Outside',
    table: { hasHeaders: false, hasTotals: true, range: 'A2:B2' },
    shown: { hasHeaders: true, hasTotals: true, range: 'A1:B2' } })
})
