import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} keeps empty-table structural edits atomic and restorable`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      book.set_text(0, 'A3', 'Qty'); book.set_text(0, 'B3', 'Amount')
      book.set_number(0, 'B5', 99)
      book.add_sheet('Report')
      book.set_formula(1, 'A1', '=ROWS(Orders[Qty])')
      book.set_formula(1, 'B1', '=IF(ISNUMBER(Sheet1!B4),SEQUENCE(2),SEQUENCE(3))')
      book.set_formula(1, 'C1', '=SUM(B1#)')
      const snapshot = book.snapshot_persistence_v1()
      snapshot.tables = [{ name: 'Orders', sheet: 'Sheet1', sheetIndex: 0, range: 'A3:B5',
        hasHeaders: true, hasTotals: true, columns: ['Qty', 'Amount'], insertRow: true,
        calculatedColumns: [null, { row: 3, formula: '=A4*2' }] }]
      book.restore_persistence_v1(JSON.parse(JSON.stringify(snapshot)))
      const saved = () => JSON.stringify(book.snapshot_persistence_v1())
      const before = saved()
      book.edit_structure(0, 'insert-rows', 4, 1)
      const inserted = saved()
      const records = { empty: Boolean(book.listTables()[0].insertRow),
        count: book.get_number(1, 'A1'), first: book.get_number(0, 'B4'),
        second: book.get_number(0, 'B5'), total: book.get_number(0, 'B6'),
        sum: book.get_number(1, 'C1'), tail: book.get_display(1, 'B3'),
        undo: book.history_state().undoCount }
      restored.restore_persistence_v1(JSON.parse(inserted))
      const roundtrip = restored.get_number(1, 'A1')
      book.history_apply('undo')
      const exactUndo = saved() === before, oldSum = book.get_number(1, 'C1')
      book.history_apply('redo')
      const exactRedo = saved() === inserted
      book.restore_persistence_v1(JSON.parse(before))
      book.edit_structure(0, 'delete-rows', 4, 1)
      const noTotals = { empty: Boolean(book.listTables()[0].insertRow),
        totals: book.listTables()[0].hasTotals,
        count: book.get_display(1, 'A1') }
      restored.restore_persistence_v1(JSON.parse(saved()))
      const noTotalsRestored = Boolean(restored.listTables()[0].insertRow)
      book.history_apply('undo')
      const totalsUndo = saved() === before
      book.edit_structure(0, 'delete-rows', 3, 1)
      restored.restore_persistence_v1(JSON.parse(saved()))
      const noInput = { empty: Boolean(restored.listTables()[0].insertRow),
        range: restored.listTables()[0].range, total: restored.get_number(0, 'B4') }
      book.restore_persistence_v1(JSON.parse(before))
      book.setDataValidation(0, 3, 1, 3, 1,
        { kind: 'whole-number', min: 1, max: 10, ignoreBlank: true })
      book.set_cell_input(0, 'F1', '9'); book.history_apply('undo')
      const stable = saved(), history = JSON.stringify(book.history_state())
      let rejected = false
      try { book.edit_structure(0, 'insert-rows', 4, 1) } catch { rejected = true }
      return { records, roundtrip, exactUndo, oldSum, exactRedo, noTotals, noTotalsRestored,
        totalsUndo, noInput, rejected, unchanged: saved() === stable,
        historyUnchanged: JSON.stringify(book.history_state()) === history }
    } finally { book.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ records: { empty: false, count: 2, first: 0, second: 0,
    total: 99, sum: 3, tail: '', undo: 1 }, roundtrip: 2, exactUndo: true,
    oldSum: 6, exactRedo: true, noTotals: { empty: true, totals: false, count: '#REF!' },
    noTotalsRestored: true, totalsUndo: true,
    noInput: { empty: false, range: 'A3:B4', total: 99 }, rejected: true,
    unchanged: true, historyUnchanged: true })
})
