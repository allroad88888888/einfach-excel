import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} commits the first empty-table record with formulas and one undo step`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      book.set_cell_input(0, 'D3', '99')
      book.add_sheet('Report')
      book.set_cell_input(1, 'A1', '=ROWS(Orders[Qty])')
      book.set_cell_input(1, 'A2', '=SUM(Orders[Amount])')
      const snapshot = book.snapshot_persistence_v1()
      snapshot.tables = [{ name: 'Orders', sheet: 'Sheet1', sheetIndex: 0, range: 'A3:B3',
        hasHeaders: false, hasTotals: false, columns: ['Qty', 'Amount'], insertRow: true,
        calculatedColumns: [null, { row: 2, formula: '=A3*2' }] }]
      book.restore_persistence_v1(JSON.parse(JSON.stringify(snapshot)))
      const before = JSON.stringify(book.snapshot_persistence_v1())
      book.set_cell_input(0, 'A3', '7')
      const first = { record: !book.listTables()[0].insertRow, rowCount: book.get_number(1, 'A1'),
        amount: book.get_number(0, 'B3'), sum: book.get_number(1, 'A2') }
      const after = JSON.stringify(book.snapshot_persistence_v1())
      book.history_apply('undo')
      const exactUndo = JSON.stringify(book.snapshot_persistence_v1()) === before
      const emptyAgain = book.get_display(1, 'A1')
      book.history_apply('redo')
      const exactRedo = JSON.stringify(book.snapshot_persistence_v1()) === after
      restored.restore_persistence_v1(JSON.parse(after))
      restored.set_cell_input(0, 'A3', '9')
      const live = restored.get_number(1, 'A2')
      restored.set_cell_input(0, 'A4', '5')
      const extended = restored.get_number(0, 'B4')
      // 失败不能留下真实记录、继承公式或消费此前输入的 redo。
      book.history_apply('undo')
      book.setDataValidation(0, 2, 1, 2, 1,
        { kind: 'whole-number', min: 0, max: 5, ignoreBlank: false })
      const stable = JSON.stringify(book.snapshot_persistence_v1())
      const history = JSON.stringify(book.history_state())
      let rejected = false
      try { book.set_cell_input(0, 'A3', '7') } catch { rejected = true }
      const unchanged = JSON.stringify(book.snapshot_persistence_v1()) === stable
      const historyUnchanged = JSON.stringify(book.history_state()) === history
      // 关闭自动扩展时仍产生当前记录，但不能隐式填充其它列。
      book.restore_persistence_v1(JSON.parse(before))
      book.set_cell_input_with_table_expansion(0, 'A3', '7', false)
      const restricted = { record: !book.listTables()[0].insertRow, amount: book.get_display(0, 'B3'),
        rowCount: book.get_number(1, 'A1') }
      book.history_apply('undo')
      const restrictedUndo = JSON.stringify(book.snapshot_persistence_v1()) === before
      return { first, exactUndo, emptyAgain, exactRedo, live, extended, rejected, unchanged,
        historyUnchanged, restricted, restrictedUndo, outside: book.get_number(0, 'D3') }
    } finally { book.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ first: { record: true, rowCount: 1, amount: 14, sum: 14 },
    exactUndo: true, emptyAgain: '#REF!', exactRedo: true, live: 18, extended: 10,
    rejected: true, unchanged: true, historyUnchanged: true,
    restricted: { record: true, amount: '', rowCount: 1 }, restrictedUndo: true, outside: 99 })
})
