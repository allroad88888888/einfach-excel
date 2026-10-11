import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmUrl = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} reuses an empty table row for headers and totals at canvas edges`, async ({ page }) => {
  await page.goto('/')
  const results = await page.evaluate(async (url) => {
    const module = await import(url)
    await module.default()
    const states = []
    for (const row of [0, 99, 1_048_575]) {
      const book = new module.WasmWorkbook(), restored = new module.WasmWorkbook()
      try {
        const address = `B${row + 1}`, outside = `C${row + 1}`
        book.set_text(0, `A${row + 1}`, 'Qty'); book.set_text(0, address, 'Amount')
        book.set_number(0, outside, 77)
        book.change_table(0, { kind: 'create', name: 'Orders', range: [row, 0, row, 1] })
        book.add_sheet('Report')
        book.set_formula(1, 'A1', '=ROWS(Orders[Amount])')
        const saved = () => JSON.stringify(book.snapshot_persistence_v1())
        const toggle = (kind: string, enabled: boolean) =>
          book.change_table(0, { kind, name: 'Orders', enabled, rowCount: row + 1 })
        const original = saved()
        toggle('header-row', false)
        const empty = saved()
        const emptyData = book.get_display(1, 'A1')
        book.history_apply('undo')
        const exactUndo = saved() === original
        book.history_apply('redo')
        const exactRedo = saved() === empty
        restored.restore_persistence_v1(JSON.parse(empty))
        const persisted = { empty: Boolean(restored.listTables()[0].insertRow),
          data: restored.get_display(1, 'A1'), range: restored.listTables()[0].range }
        toggle('totals-row', true)
        const total = book.listTables()[0]
        const totalFormula = book.get_formula(0, address)
        book.history_apply('undo')
        const totalUndo = saved() === empty
        book.history_apply('redo')
        toggle('totals-row', false)
        const totalHidden = saved() === empty
        toggle('header-row', true)
        const headerShown = saved() === original
        toggle('header-row', false)
        book.set_cell_input(0, address, '7')
        const record = { count: book.get_number(1, 'A1'), value: book.get_number(0, address),
          empty: Boolean(book.listTables()[0].insertRow) }
        book.history_apply('undo')
        states.push({ row, emptyData, exactUndo, exactRedo, persisted,
          total: { enabled: total.hasTotals, empty: Boolean(total.insertRow), range: total.range },
          totalFormula, totalUndo, totalHidden, headerShown, record, inputUndo: saved() === empty,
          outside: book.get_number(0, outside) })
      } finally { book.free(); restored.free() }
    }
    return states
  }, `${wasmUrl}${variant}/einfach_wasm.js`)
  for (const result of results) expect(result).toEqual({ row: result.row,
    emptyData: '#REF!', exactUndo: true, exactRedo: true,
    persisted: { empty: true, data: '#REF!', range: `A${result.row + 1}:B${result.row + 1}` },
    total: { enabled: true, empty: false, range: `A${result.row + 1}:B${result.row + 1}` },
    totalFormula: '=SUBTOTAL(109,Orders[Amount])', totalUndo: true, totalHidden: true,
    headerShown: true, record: { count: 1, value: 7, empty: false }, inputUndo: true, outside: 77 })
})
