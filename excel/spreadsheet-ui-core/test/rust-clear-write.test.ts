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
    const clear = vi.fn()
    const patch = vi.fn()
    const workbook = { clear_range: clear, patch_format_range: patch } as unknown as WasmWorkbook
    clearRange(workbook, 0, { ...request, mode })
    if (mode === 'formats') expect(clear).not.toHaveBeenCalled()
    else expect(clear).toHaveBeenCalledWith(0, 1, 2, 3, 4)
    if (mode === 'contents') expect(patch).not.toHaveBeenCalled()
    else {
      expect(patch).toHaveBeenCalledWith(
        0,
        1,
        2,
        3,
        4,
        expect.objectContaining({ bold: false, fgColor: null, numberFormat: { kind: 'general' } }),
        'cell',
      )
      expect(patch.mock.calls[0]?.[5]).not.toHaveProperty('height')
      expect(patch.mock.calls[0]?.[5]).not.toHaveProperty('width')
    }
  })

  test.each(['row', 'column'] as const)('clears inherited formatting through %s scope', (scope) => {
    const patch = vi.fn()
    clearRange({ patch_format_range: patch } as unknown as WasmWorkbook, 0, {
      ...request,
      scope,
      mode: 'formats',
    })
    expect(patch.mock.calls[0]?.[6]).toBe(scope)
  })

  test('preflights all required methods before changing anything', () => {
    const clear = vi.fn()
    expect(() => clearRange({ clear_range: clear } as unknown as WasmWorkbook, 0, request)).toThrow(
      'patch_format_range',
    )
    expect(clear).not.toHaveBeenCalled()
  })

  test('does not clear values if Rust rejects the style patch', () => {
    const clear = vi.fn()
    const patch = vi.fn(() => {
      throw new Error('Invalid style')
    })
    expect(() =>
      clearRange(
        { clear_range: clear, patch_format_range: patch } as unknown as WasmWorkbook,
        0,
        request,
      ),
    ).toThrow('Invalid style')
    expect(clear).not.toHaveBeenCalled()
  })
})
