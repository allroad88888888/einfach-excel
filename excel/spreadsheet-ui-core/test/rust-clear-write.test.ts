import { describe, expect, test, vi } from 'vitest'
import { clearRange } from '../src/rust-workbook/clear-io'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'
import type { RustClearRangeRequest } from '../src/rust-workbook/commands'

const request: RustClearRangeRequest = {
  sheetId: 'sheet-1',
  requestId: 1,
  scope: 'cell',
  mode: 'all',
  range: { rowStart: 1, rowEnd: 3, colStart: 2, colEnd: 4 },
}

describe('Rust clear writer', () => {
  test.each(['contents', 'formats', 'all'] as const)('clears only the requested %s', (mode) => {
    const clear = vi.fn(() => request.range)
    const workbook = { clear_selection: clear } as unknown as WasmWorkbook
    expect(clearRange(workbook, 0, { ...request, mode })).toEqual(request.range)
    expect(clear).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledWith({ sheet: 0, mode,
      targets: [{ ...request.range, scope: 'cell' }] })
  })

  test.each(['row', 'column'] as const)('clears inherited formatting through %s scope', (scope) => {
    const clear = vi.fn(() => request.range)
    clearRange({ clear_selection: clear } as unknown as WasmWorkbook, 0, {
      ...request,
      scope,
      mode: 'formats',
    })
    expect(clear).toHaveBeenCalledWith({ sheet: 0, mode: 'formats',
      targets: [{ ...request.range, scope }] })
  })

  test('refuses a missing native transaction rather than falling back to partial writes', () => {
    expect(() => clearRange({} as WasmWorkbook, 0, request)).toThrow('clear_selection')
  })

  test('forwards every target once and preserves native rejection without a JS history group', () => {
    const clear = vi.fn(() => { throw new Error('Invalid second target') })
    const targets = [{ ...request.range, scope: 'cell' as const },
      { rowStart: 9, rowEnd: 10, colStart: 2, colEnd: 4, scope: 'row' as const }]
    expect(() => clearRange({ clear_selection: clear } as unknown as WasmWorkbook, 3,
      { ...request, targets })).toThrow('Invalid second target')
    expect(clear).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledWith({ sheet: 3, mode: 'all', targets })
  })
})
