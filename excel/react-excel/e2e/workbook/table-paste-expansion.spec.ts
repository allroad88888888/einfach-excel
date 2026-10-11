import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { copy, paste, select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function tableRange(page: Page, expected: string) {
  await button(page, 'Tables').click()
  await button(page, 'Edit table CalculatedOrders').click()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue(expected)
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '5:1')).toHaveText('140')
})

test('external multi-row paste expands the seed table and inherits its calculated column',
  async ({ page }) => {
    await select(page, 'A50', '49:0')
    await page.evaluate(() => navigator.clipboard.writeText('4\t40\n5\t50'))
    await paste(page)
    await expect(cell(page, '49:2')).toHaveText('160')
    await expect(cell(page, '50:2')).toHaveText('250')
    await tableRange(page, 'A46:C51')
    await select(page, 'B6', '5:1')
    await expect(cell(page, '5:1')).toHaveText('550')
    await button(page, 'Undo').click()
    await expect(cell(page, '5:1')).toHaveText('140')
    await expect(button(page, 'Undo')).toBeDisabled()
    await tableRange(page, 'A46:C49')
    await select(page, 'A50', '49:0')
    await expect(cell(page, '49:0')).toHaveText('')
    await expect(cell(page, '49:2')).toHaveText('')
    await button(page, 'Redo').click()
    await expect(cell(page, '50:2')).toHaveText('250')
  })

test('copying two seed rows uses the same native paste expansion and one undo', async ({ page }) => {
  await select(page, 'A47:B48', '46:0')
  await copy(page)
  await select(page, 'A50', '49:0')
  await paste(page)
  await expect(cell(page, '49:2')).toHaveText('10')
  await expect(cell(page, '50:2')).toHaveText('40')
  await tableRange(page, 'A46:C51')
  await button(page, 'Undo').click()
  await expect(cell(page, '49:2')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('right-hand paste creates unique literal headers and preserves data after redo',
  async ({ page }) => {
    await select(page, 'D46', '45:3')
    await page.evaluate(() => navigator.clipboard.writeText('Quantity\t=1+1\n7\t8'))
    await paste(page)
    await expect(cell(page, '45:3')).toHaveText('Column1')
    await expect(cell(page, '45:4')).toHaveText('=1+1')
    await expect(cell(page, '46:4')).toHaveText('8')
    await tableRange(page, 'A46:E49')
    await button(page, 'Undo').click()
    await expect(cell(page, '45:3')).toHaveText('')
    await expect(button(page, 'Undo')).toBeDisabled()
    await tableRange(page, 'A46:C49')
    await button(page, 'Redo').click()
    await expect(cell(page, '45:4')).toHaveText('=1+1')
    await expect(cell(page, '46:4')).toHaveText('8')
  })

test('downward paste keeps extra columns outside and preserves explicit formula exceptions',
  async ({ page }) => {
    await select(page, 'A50', '49:0')
    await page.evaluate(() => navigator.clipboard.writeText('4\t40\t99\tOutside\n5\t50\t\tTail'))
    await paste(page)
    await expect(cell(page, '49:2')).toHaveText('99')
    await expect(cell(page, '50:2')).toHaveText('')
    await expect(cell(page, '50:3')).toHaveText('Tail')
    await tableRange(page, 'A46:C51')
    await button(page, 'Undo').click()
    await expect(cell(page, '50:3')).toHaveText('')
    await expect(button(page, 'Undo')).toBeDisabled()
  })

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} expanded tables round-trip with exact history`,
  async ({ page }) => {
    const result = await page.evaluate(async (url) => {
      const module = await import(url)
      await module.default()
      const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
      try {
        book.set_number(0, 'A2', 2)
        book.set_formula(0, 'B2', '=A2*2')
        const snapshot = book.snapshot_persistence_v1()
        snapshot.tables = [{ name: 'Orders', sheet: 'Sheet1', sheetIndex: 0, range: 'A1:B2',
          hasHeaders: true, hasTotals: false, columns: ['Qty', 'Amount'],
          calculatedColumns: [null, { row: 1, formula: '=A2*2' }] }]
        book.restore_persistence_v1(JSON.parse(JSON.stringify(snapshot)))
        const saved = () => {
          const state = book.snapshot_persistence_v1()
          // 稀疏格由 HashMap 枚举；仅统一条目顺序，仍逐字段比较全部持久数据。
          state.cells.sort((a: { sheet: number, row: number, col: number },
            b: { sheet: number, row: number, col: number }) =>
            a.sheet - b.sheet || a.row - b.row || a.col - b.col)
          return JSON.stringify(state)
        }
        const before = saved(), policy = { rowCount: 100, colCount: 10 }
        book.paste_clipboard(0, 2, 0, '3\n4', false, policy)
        const down = { range: book.listTables()[0].range, amount: book.get_number(0, 'B4'),
          undo: book.history_state().undoCount }
        const after = saved()
        book.history_apply('undo')
        const exactUndo = saved() === before
        book.history_apply('redo')
        const exactRedo = saved() === after
        restored.restore_persistence_v1(JSON.parse(after))
        restored.paste_clipboard(0, 4, 0, '5', false, policy)
        const inherited = restored.get_number(0, 'B5')
        book.paste_clipboard(0, 0, 2, 'Qty\t=1+1\n7\t8', false, policy)
        const right = { range: book.listTables()[0].range,
          columns: book.listTables()[0].columns, literal: book.get_display(0, 'D1') }
        book.history_apply('undo')
        const columnUndo = saved() === after
        const history = JSON.stringify(book.history_state())
        let rejected = false
        try { book.paste_clipboard(0, 4, 0, '=SEQUENCE(2)', false, policy) } catch { rejected = true }
        return { down, exactUndo, exactRedo, inherited, right, columnUndo, rejected,
          rollback: saved() === after && JSON.stringify(book.history_state()) === history }
      } finally { book.free(); restored.free() }
    }, `${wasmUrl}${variant}/einfach_wasm.js`)
    expect(result).toEqual({ down: { range: 'A1:B4', amount: 8, undo: 1 },
      exactUndo: true, exactRedo: true, inherited: 10,
      right: { range: 'A1:D4', columns: ['Qty', 'Amount', 'Column1', '=1+1'], literal: '=1+1' },
      columnUndo: true, rejected: true, rollback: true })
  })
