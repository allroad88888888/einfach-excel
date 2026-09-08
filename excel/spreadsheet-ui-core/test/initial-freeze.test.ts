import { expect, test, vi } from 'vitest'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import { initializeWorkbook } from '../src/rust-workbook/initialize-workbook'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'

function definition(freeze = { rows: 2, cols: 1 }) {
  return {
    title: 'Book',
    sheets: [{ id: 's', name: 'Sheet', rowCount: 10, colCount: 8, freeze }],
    createImportChunks: () => [],
  }
}
test('initial freeze metadata is copied and frozen before asynchronous startup', () => {
  const input = definition()
  const snapshot = snapshotRustWorkbookDefinition(input)
  input.sheets[0].freeze.rows = 9
  expect(snapshot.sheets[0].freeze).toEqual({ rows: 2, cols: 1 })
  expect(Object.isFrozen(snapshot.sheets[0].freeze)).toBe(true)
})
test.each([
  { rows: -1, cols: 0 },
  { rows: 1.5, cols: 1 },
  { rows: 10, cols: 0 },
  { rows: 0, cols: 8 },
])('invalid seed boundaries are rejected: %j', (freeze) => {
  expect(() => snapshotRustWorkbookDefinition(definition(freeze))).toThrow('initial freeze')
})
test('seed goes through the native command then startup history is cleared', () => {
  const freeze = vi.fn(() => true)
  const clear = vi.fn()
  class Native {
    rename_sheet() {}

    sheet_name() {
      return 'Sheet'
    }

    set_frozen_panes = freeze
    history_clear = clear
  }
  initializeWorkbook({ WasmWorkbook: Native } as unknown as RustWasmModule, definition().sheets)
  expect(freeze.mock.calls).toEqual([[0, 2, 1]])
  expect(clear.mock.calls).toEqual([['']])
  expect(freeze.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder[0])
})
