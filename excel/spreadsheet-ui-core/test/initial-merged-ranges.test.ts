import { expect, test, vi } from 'vitest'
import { snapshotRustWorkbookDefinition } from '../src/runtime/rust-workbook-definition'
import { initializeWorkbook } from '../src/rust-workbook/initialize-workbook'
import type { RustWasmModule } from '../src/rust-workbook/wasm-types'

const range = { rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 }
function definition(mergedRanges = [range]) {
  return {
    title: 'Book',
    sheets: [{ id: 's', name: 'Sheet', rowCount: 10, colCount: 5, mergedRanges }],
    createImportChunks: () => [],
  }
}

test('startup snapshots merge metadata without keeping mutable demo objects', () => {
  const input = definition([{ ...range }])
  const snapshot = snapshotRustWorkbookDefinition(input)
  input.sheets[0].mergedRanges[0].rowStart = 0
  expect(snapshot.sheets[0].mergedRanges).toEqual([range])
  expect(Object.isFrozen(snapshot.sheets[0].mergedRanges)).toBe(true)
  expect(Object.isFrozen(snapshot.sheets[0].mergedRanges![0])).toBe(true)
})

test.each([
  { ...range, rowStart: -1 },
  { ...range, colStart: 0.5 },
  { ...range, rowEnd: 10 },
  { ...range, colEnd: 5 },
  { ...range, rowStart: 4 },
  { ...range, colStart: 3 },
  { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
])('invalid merge metadata is rejected before startup: %j', (invalid) => {
  expect(() => snapshotRustWorkbookDefinition(definition([invalid]))).toThrow(
    'Invalid initial merged range',
  )
})

test('initial merges use the existing native command then clear startup history', () => {
  const merge = vi.fn(() => true)
  const clear = vi.fn()
  class Native {
    rename_sheet() {}

    sheet_name() {
      return 'Sheet'
    }

    merge_cells = merge
    history_clear = clear
  }
  const wasm = { WasmWorkbook: Native } as unknown as RustWasmModule
  initializeWorkbook(wasm, snapshotRustWorkbookDefinition(definition()).sheets)
  expect(merge.mock.calls).toEqual([[0, 2, 1, 3, 2, 'merge', false]])
  expect(clear.mock.calls).toEqual([['']])
  expect(merge.mock.invocationCallOrder[0]).toBeLessThan(clear.mock.invocationCallOrder[0])
})
