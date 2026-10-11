import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { select } from '../support/clipboard'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
async function open(page: Page, name = 'DemoTable') {
  await button(page, 'Tables').click()
  await button(page, `Edit table ${name}`).click()
}
async function close(page: Page) {
  await button(page, 'Cancel').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '4:1')).toHaveText('60')
})

test('adding a data row moves the totals and undo restores the original table', async ({ page }) => {
  await select(page, 'B84', '83:1')
  await expect(cell(page, '83:1')).toHaveText('60')
  await expect(cell(page, '84:1')).toHaveText('ALPHA')
  await open(page)
  await button(page, 'Add data row').click()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B85')
  await close(page)
  await expect(cell(page, '83:1')).toHaveText('')
  await expect(cell(page, '84:1')).toHaveText('60')
  await expect(cell(page, '85:1')).toHaveText('ALPHA')
  await select(page, 'B84', '83:1')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('40'); await input.press('Enter')
  await expect(cell(page, '84:1')).toHaveText('100')
  await button(page, 'Undo').click()
  await expect(cell(page, '84:1')).toHaveText('60')
  await button(page, 'Undo').click()
  await expect(cell(page, '83:1')).toHaveText('60')
  await expect(cell(page, '84:1')).toHaveText('ALPHA')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '83:1')).toHaveText('')
  await expect(cell(page, '84:1')).toHaveText('60')
})

test('new seed table records inherit calculated formulas with one undo', async ({ page }) => {
  await select(page, 'C50', '49:2')
  await open(page, 'CalculatedOrders')
  await button(page, 'Add data row').click()
  await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A46:C50')
  await close(page)
  await expect(cell(page, '49:2')).toHaveText('0')
  await select(page, 'C50', '49:2')
  await expect(page.getByRole('textbox', { name: 'Active cell value' }))
    .toHaveValue(/\[@Quantity\].*\[@Price\]/)
  await button(page, 'Undo').click()
  await expect(cell(page, '49:2')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
})

for (const width of [1280, 390]) test(`append control fits ${width}px and retains keyboard focus`,
  async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await open(page)
    const add = button(page, 'Add data row')
    await add.focus(); await add.press('Enter')
    await expect(page.getByLabel('Table range', { exact: true })).toHaveValue('A80:B85')
    await expect(add).toBeFocused()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((element) =>
      element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ path: `/tmp/excel-table-append-${width}.png`, fullPage: true })
    await close(page)
    await expect(button(page, 'Tables')).toBeFocused()
  })

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} append round-trips calculated columns and totals`,
  async ({ page }) => {
    const result = await page.evaluate(async (url) => {
      const module = await import(url)
      await module.default()
      const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
      try {
        book.set_number(0, 'A2', 2)
        book.set_formula(0, 'B2', '=A2*2')
        book.set_formula(0, 'B3', '=SUM(Orders[Amount])')
        book.set_text(0, 'B4', 'Neighbor')
        book.set_number(0, 'C4', 42)
        const snapshot = book.snapshot_persistence_v1()
        snapshot.tables = [{ name: 'Orders', sheet: 'Sheet1', sheetIndex: 0, range: 'A1:B3',
          hasHeaders: true, hasTotals: true, columns: ['Qty', 'Amount'],
          calculatedColumns: [null, { row: 1, formula: '=A2*2' }] }]
        book.restore_persistence_v1(JSON.parse(JSON.stringify(snapshot)))
        const saved = () => {
          const state = book.snapshot_persistence_v1()
          state.cells.sort((a: { sheet: number, row: number, col: number },
            b: { sheet: number, row: number, col: number }) =>
            a.sheet - b.sheet || a.row - b.row || a.col - b.col)
          return JSON.stringify(state)
        }
        const before = saved()
        book.change_table(0, { kind: 'append-row', name: 'Orders', rowCount: 100 })
        const after = saved()
        const appended = { range: book.listTables()[0].range, value: book.get_number(0, 'B3'),
          total: book.get_number(0, 'B4'), neighbor: book.get_display(0, 'B5'),
          side: book.get_number(0, 'C4'), undo: book.history_state().undoCount }
        book.history_apply('undo'); const exactUndo = saved() === before
        book.history_apply('redo'); const exactRedo = saved() === after
        restored.restore_persistence_v1(JSON.parse(after))
        restored.set_number(0, 'A3', 5)
        const recalculated = restored.get_number(0, 'B3')
        restored.change_table(0, { kind: 'append-row', name: 'Orders', rowCount: 100 })
        const inherited = restored.get_number(0, 'B4'), total = restored.get_number(0, 'B5')
        const history = JSON.stringify(book.history_state())
        let rejected = false
        try {
          book.change_table(0, { kind: 'append-row', name: 'Orders', rowCount: 4 })
        } catch { rejected = true }
        return { appended, exactUndo, exactRedo, recalculated, inherited, total, rejected,
          rollback: saved() === after && JSON.stringify(book.history_state()) === history }
      } finally { book.free(); restored.free() }
    }, `${wasmUrl}${variant}/einfach_wasm.js`)
    expect(result).toEqual({ appended: { range: 'A1:B4', value: 0, total: 4,
      neighbor: 'Neighbor', side: 42, undo: 1 }, exactUndo: true, exactRedo: true,
    recalculated: 10, inherited: 0, total: 14, rejected: true, rollback: true })
  })
