import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} resizes and expands an empty table with exact history`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
    try {
      book.set_text(0, 'A3', 'Qty'); book.set_text(0, 'B3', 'Amount')
      book.set_number(0, 'D4', 99)
      book.add_sheet('Report')
      book.set_formula(1, 'A1', '=ROWS(Orders[Qty])')
      const snapshot = book.snapshot_persistence_v1()
      snapshot.tables = [{ name: 'Orders', sheet: 'Sheet1', sheetIndex: 0, range: 'A3:B4',
        hasHeaders: true, hasTotals: false, columns: ['Qty', 'Amount'], insertRow: true,
        calculatedColumns: [null, { row: 3, formula: '=A4*2' }] }]
      const saved = () => JSON.stringify(book.snapshot_persistence_v1())
      book.restore_persistence_v1(JSON.parse(JSON.stringify(snapshot)))
      const before = saved()
      const resize = (range: number[]) => book.change_table(0, { kind: 'resize', name: 'Orders', range })
      resize([2, 0, 3, 2])
      const widthOnly = { empty: Boolean(book.listTables()[0].insertRow), formula: book.get_display(0, 'B4') }
      book.history_apply('undo')
      const widthUndo = saved() === before
      resize([2, 0, 5, 1])
      const grown = saved()
      const records = { empty: Boolean(book.listTables()[0].insertRow), count: book.get_number(1, 'A1'),
        values: ['B4', 'B5', 'B6'].map((addr) => book.get_number(0, addr)) }
      restored.restore_persistence_v1(JSON.parse(grown))
      const roundtrip = restored.get_number(1, 'A1')
      book.history_apply('undo')
      const growthUndo = saved() === before
      book.history_apply('redo')
      const growthRedo = saved() === grown
      book.restore_persistence_v1(JSON.parse(before))
      book.set_cell_input(0, 'C4', '=B4+1')
      const right = { empty: Boolean(book.listTables()[0].insertRow), amount: book.get_number(0, 'B4'),
        value: book.get_number(0, 'C4'), template: Boolean(book.listTables()[0].calculatedColumns[2]) }
      const rightSaved = saved()
      book.history_apply('undo')
      const rightUndo = saved() === before
      book.history_apply('redo')
      const rightRedo = saved() === rightSaved
      book.restore_persistence_v1(JSON.parse(before))
      book.set_cell_input(0, 'A5', '7')
      const below = { count: book.get_number(1, 'A1'), first: book.get_number(0, 'B4'), second: book.get_number(0, 'B5') }
      book.history_apply('undo')
      const belowUndo = saved() === before
      resize([2, 0, 2, 1])
      restored.restore_persistence_v1(JSON.parse(saved()))
      const headerOnly = { range: restored.listTables()[0].range,
        empty: Boolean(restored.listTables()[0].insertRow), count: restored.get_display(1, 'A1') }
      return { widthOnly, widthUndo, records, roundtrip, growthUndo, growthRedo,
        right, rightUndo, rightRedo, below, belowUndo, headerOnly, outside: book.get_number(0, 'D4') }
    } finally { book.free(); restored.free() }
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  expect(result).toEqual({ widthOnly: { empty: true, formula: '' }, widthUndo: true,
    records: { empty: false, count: 3, values: [0, 0, 0] }, roundtrip: 3,
    growthUndo: true, growthRedo: true,
    right: { empty: false, amount: 0, value: 1, template: true },
    rightUndo: true, rightRedo: true, below: { count: 2, first: 0, second: 14 }, belowUndo: true,
    headerOnly: { range: 'A3:B3', empty: false, count: '#REF!' }, outside: 99 })
})
