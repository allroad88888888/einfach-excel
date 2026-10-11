import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const wasmBase = `/@fs${fileURLToPath(new URL('../../../excel-wasm/', import.meta.url))}`
const fileIo = `/@fs${fileURLToPath(new URL('../../../spreadsheet-ui-core/src/rust-workbook/file-io.ts', import.meta.url))}`
for (const variant of ['lite', 'full']) test(`${variant} file commands preserve native structures through JSON`, async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async ({ wasmUrl, ioUrl }) => {
    const wasm = await import(wasmUrl), io = await import(ioUrl)
    await wasm.default()
    const book = new wasm.WasmWorkbook()
    let opened
    try {
      book.set_text(0, 'A1', 'Title'); book.set_number(0, 'B2', 42)
      book.add_sheet('Other'); book.set_formula(1, 'A1', '=Sheet1!B2*2')
      book.set_frozen_panes(0, 1, 1)
      book.merge_cells(0, 4, 0, 4, 1, 'merge', false)
      book.change_named_range(0, { kind: 'create', name: 'Amount',
        target: { sheet: 0, range: [1, 1, 1, 1] } })
      book.setDataValidation(0, 1, 1, 2, 1, { kind: 'whole-number', operator: 'between',
        min: 0, max: 100, ignoreBlank: true })
      const metadata = [0, 1].map((index) => ({ index, id: `sheet-${index}`,
        name: book.sheet_name(index), rowCount: 100, colCount: 10 }))
      const before = JSON.parse(JSON.stringify(book.snapshot_persistence_v1()))
      const file = io.exportWorkbookFile(book, metadata, 'Round trip')
      opened = io.openWorkbookFile(wasm, file.text, 'fresh')
      const after = JSON.parse(JSON.stringify(opened.workbook.snapshot_persistence_v1()))
      // 稀疏格由 HashMap 枚举；按坐标比较全部内容，不依赖枚举顺序。
      const order = (a: { sheet: number; row: number; col: number },
        b: { sheet: number; row: number; col: number }) =>
        a.sheet - b.sheet || a.row - b.row || a.col - b.col
      before.cells.sort(order); after.cells.sort(order)
      return { before, after, metadata: opened.metadata,
        emptyUndo: !opened.workbook.history_apply('undo'), filename: file.filename }
    } finally { opened?.workbook.free(); book.free() }
  }, { wasmUrl: `${wasmBase}${variant}/einfach_wasm.js`, ioUrl: fileIo })
  expect(result.after).toEqual(result.before)
  expect(result.emptyUndo).toBe(true)
  expect(result.filename).toBe('Round trip.einfach.json')
  expect(result.metadata.sheets).toMatchObject([
    { id: 'fresh-0', index: 0, rowCount: 100, colCount: 10 },
    { id: 'fresh-1', index: 1, name: 'Other', rowCount: 100, colCount: 10 },
  ])
})
