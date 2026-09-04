import { describe, expect, test } from 'vitest'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'
import { readVisibleProjection } from '../src/rust-workbook/visible-projection'

describe('Rust visible format projection', () => {
  test('projects range formatting onto values and formatted blank cells', () => {
    const workbook = {
      read_sparse_range: () => [
        {
          sheet: 0,
          addr: 'A1',
          display: 'Northwind',
          type: 'text',
          isError: false,
          formula: '',
        },
      ],
      snapshot_format_range: () => ({
        cellStyles: [{ addr: 'A1', format: { italic: true } }],
        rowStyles: [{ index: 0, format: { bold: true }, height: 51 }],
        columnStyles: [],
      }),
    } as unknown as WasmWorkbook

    const result = readVisibleProjection(
      workbook,
      0,
      {
        kind: 'visible-window',
        sheetId: 'sheet-1',
        requestId: 1,
        window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 },
      },
      1,
    )

    expect(result.cells).toEqual([
      {
        row: 0,
        col: 0,
        displayValue: 'Northwind',
        valueKind: 'string',
        format: { bold: true, italic: true },
      },
      {
        row: 0,
        col: 1,
        displayValue: '',
        valueKind: 'blank',
        format: { bold: true },
      },
    ])
    expect(result.rowHeights).toEqual([{ rowIndex: 0, heightPx: 51 }])
  })
})
