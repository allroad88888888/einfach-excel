import { describe, expect, test, vi } from 'vitest'
import { writeRangeFormat } from '../src/rust-workbook/format-io'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

describe('Rust format writer', () => {
  test('sends sparse patches and explicit clears to the scoped WASM API', () => {
    const patchFormatRange = vi.fn()
    const workbook = { patch_format_range: patchFormatRange } as unknown as WasmWorkbook

    writeRangeFormat(workbook, 0, {
      kind: 'set-format-range',
      sheetId: 'sheet-1',
      range: { rowStart: 2, rowEnd: 2, colStart: 0, colEnd: 7 },
      format: { bold: true },
      clearFormatFields: ['fgColor'],
      writeMode: 'patch',
      scope: 'row',
    })

    expect(patchFormatRange).toHaveBeenCalledWith(
      0,
      2,
      0,
      2,
      7,
      { bold: true, fgColor: null },
      'row',
    )
  })

  test('keeps old complete-format calls on the compatibility API', () => {
    const setFormatRange = vi.fn()
    const workbook = { set_format_range: setFormatRange } as unknown as WasmWorkbook

    writeRangeFormat(workbook, 1, {
      kind: 'set-format-range',
      sheetId: 'sheet-2',
      range: { rowStart: 0, rowEnd: 1, colStart: 3, colEnd: 3 },
      format: { italic: true },
    })

    expect(setFormatRange).toHaveBeenCalledWith(1, 0, 3, 1, 3, { italic: true })
  })
})
