import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const merged = (page: Page, coord: string) =>
  page.locator(`[data-merged-cell][data-cell="${coord}"]`)
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

test('local header insertion moves a merged formula and undo restores its complete geometry', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
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
  // 空合并格也占用原表头位置，不能只根据 value 是否为空决定复用。
  await select(page, 'A1:D1', '0:0')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await expect(merged(page, '0:0')).toBeVisible()
  await input(page, 'B6', '5:1', '=B2+B3')
  await select(page, 'B6:C7', '5:1')
  await page.getByRole('combobox', { name: 'Merge cells', exact: true }).selectOption('merge')
  await expect(merged(page, '5:1')).toHaveText('5')
  await headers(page, true)
  await select(page, 'A1', '0:0')
  await expect(merged(page, '0:0')).toHaveAttribute('aria-colspan', '4')
  await expect(merged(page, '6:1')).toHaveText('5')
  await expect(merged(page, '6:1')).toHaveAttribute('aria-rowspan', '2')
  await expect(merged(page, '6:1')).toHaveAttribute('aria-colspan', '2')
  await expect(merged(page, '5:1')).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(merged(page, '5:1')).toHaveText('5')
  await expect(merged(page, '6:1')).toHaveCount(0)
  await button(page, 'Redo').click()
  await expect(merged(page, '6:1')).toHaveText('5')
  await input(page, 'B3', '2:1', '7')
  await expect(merged(page, '6:1')).toHaveText('10')
  expect(errors).toEqual([])
})

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} persists moved merge geometry and formula sources`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      for (const [address, value] of [['B1', 'Qty'], ['C1', 'Tax'], ['B2', '2'], ['B3', '3']])
        book.set_cell_input(0, address, value)
      book.change_table(0, { kind: 'create', name: 'Orders', range: [0, 1, 2, 2] })
      book.change_table(0, { kind: 'header-row', name: 'Orders', enabled: false })
      book.merge_cells(0, 0, 0, 0, 3, 'merge', false)
      book.set_cell_input(0, 'B6', '=B2+B3')
      book.merge_cells(0, 5, 1, 6, 2, 'merge', false)
      book.add_sheet('Report')
      book.set_cell_input(1, 'A1', '=Sheet1!B6')
      const before = JSON.stringify(book.snapshot_persistence_v1())
      book.change_table(0, { kind: 'header-row', name: 'Orders', enabled: true, rowCount: 100 })
      const after = JSON.stringify(book.snapshot_persistence_v1())
      book.history_apply('undo')
      const exactUndo = JSON.stringify(book.snapshot_persistence_v1()) === before
      book.history_apply('redo')
      const exactRedo = JSON.stringify(book.snapshot_persistence_v1()) === after
      restored.restore_persistence_v1(JSON.parse(after))
      const value = restored.get_number(0, 'B7')
      const consumer = restored.get_number(1, 'A1')
      const cleanHistory = !restored.history_apply('undo')
      restored.set_cell_input(0, 'B3', '7')
      return { exactUndo, exactRedo, cleanHistory, value, consumer,
        merges: Array.from(restored.merged_ranges(0)), updated: restored.get_number(0, 'B7'),
        updatedConsumer: restored.get_number(1, 'A1') }
    } finally { book.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ exactUndo: true, exactRedo: true, cleanHistory: true,
    value: 5, consumer: 5, merges: [0, 0, 0, 3, 6, 1, 7, 2], updated: 10, updatedConsumer: 10 })
})

for (const variant of ['lite', 'full']) test(`${variant} reblocks a newly expanded array on merge movement undo`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook()
    try {
      book.change_table(0, { kind: 'create', name: 'Orders', range: [0, 1, 2, 2] })
      book.change_table(0, { kind: 'header-row', name: 'Orders', enabled: false })
      book.set_cell_input(0, 'B1', 'Occupied')
      book.merge_cells(0, 5, 1, 6, 2, 'merge', false)
      book.set_cell_input(0, 'A6', '=SEQUENCE(1,4)')
      const blocked = book.get_display(0, 'A6')
      book.change_table(0, { kind: 'header-row', name: 'Orders', enabled: true, rowCount: 100 })
      const expanded = book.get_number(0, 'C6')
      book.history_apply('undo')
      const undone = book.get_display(0, 'A6')
      const cleared = book.get_display(0, 'C6')
      book.history_apply('redo')
      return { blocked, expanded, undone, cleared, redone: book.get_number(0, 'C6') }
    } finally { book.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ blocked: '#SPILL!', expanded: 3, undone: '#SPILL!', cleared: '', redone: 3 })
})
