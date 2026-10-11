import { expect, test, vi } from 'vitest'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import { initializeWorkbook } from '../src/rust-workbook/initialize-workbook'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'

function definition() {
  return { title: 'Book', sheets: [{ id: 's', name: 'Sheet', rowCount: 100, colCount: 8,
    namedRanges: [{ name: 'Amounts',
      range: { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 } }],
  }], createImportChunks: () => [] }
}

test('initial named ranges are copied, frozen and checked against the sheet canvas', () => {
  const source = definition()
  const result = snapshotRustWorkbookDefinition(source)
  source.sheets[0].namedRanges[0].range.rowEnd = 200
  expect(result.sheets[0].namedRanges![0].range.rowEnd).toBe(3)
  expect(Object.isFrozen(result.sheets[0].namedRanges![0].range)).toBe(true)
  expect(() => snapshotRustWorkbookDefinition(source)).toThrow('Invalid initial named range')
})

test('initial definitions call native CRUD before clearing startup history', () => {
  const change = vi.fn(() => true)
  const clear = vi.fn()
  class Native {
    rename_sheet() {}
    sheet_name() { return 'Sheet' }
    change_named_range = change
    history_clear = clear
  }
  initializeWorkbook({ WasmWorkbook: Native } as unknown as RustWasmModule,
    snapshotRustWorkbookDefinition(definition()).sheets)
  expect(change).toHaveBeenCalledTimes(1)
  expect(change).toHaveBeenCalledWith(0, {
    kind: 'create', name: 'Amounts', target: { sheet: 0, range: [1, 0, 3, 0] },
  })
  expect(clear).toHaveBeenCalledTimes(1)
  expect(change.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder[0])
})
