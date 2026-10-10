import { describe, expect, test } from 'vitest'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'
import { readVisibleProjection } from '../src/rust-workbook/visible-projection'

describe('Rust visible format projection', () => {
  test.each(['scientific', 'fraction', 'time'] as const)(
    '%s preserves native display instead of invoking a second formatter', (kind) => {
      const workbook = {
        read_sparse_range: () => [{ sheet: 0, addr: 'A1', display: '0.5',
          formattedDisplay: 'native display witness', inputText: '=1/2',
          type: 'number', isError: false, formula: '=1/2' }],
        snapshot_format_range: () => ({ cellStyles: [{ addr: 'A1',
          format: { numberFormat: { kind } } }], rowStyles: [], columnStyles: [] }),
      } as unknown as WasmWorkbook
      const result = readVisibleProjection(workbook, 0, {
        kind: 'visible-window', sheetId: 's', requestId: 1,
        window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
      }, 1)
      expect(result.cells[0]).toMatchObject({ displayValue: 'native display witness',
        numericValue: 0.5, inputText: '=1/2' })
    },
  )
  test.each([null, undefined])('explicit %s clears inherited color; absent fields still inherit', (clear) => {
    const workbook = {
      read_sparse_range: () => [],
      snapshot_format_range: () => ({
        cellStyles: [{ addr: 'A1', format: { bgColor: clear, fgColor: clear, italic: true } }],
        rowStyles: [{ index: 0, format: { bgColor: '#93c47d', fgColor: '#c00000', bold: true } }],
        columnStyles: [],
      }),
    } as unknown as WasmWorkbook
    const result = readVisibleProjection(workbook, 0, {
      kind: 'visible-window', sheetId: 's', requestId: 1,
      window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 },
    }, 1)
    expect(result.cells[0]?.format).toEqual({ bold: true, italic: true })
    expect(result.cells[1]?.format).toEqual({ bold: true, bgColor: '#93c47d', fgColor: '#c00000' })
  })

  test('retains native leap-day display without changing numeric or editable values', () => {
    const workbook = {
      read_sparse_range: () => [{ sheet: 0, addr: 'A1', display: '60',
        formattedDisplay: '1900-02-29', inputText: '=DATE(1900,2,29)',
        type: 'number', isError: false, formula: '=DATE(1900,2,29)' }],
      snapshot_format_range: () => ({ cellStyles: [{ addr: 'A1',
        format: { numberFormat: { kind: 'date', pattern: 'yyyy-mm-dd' } } }],
        rowStyles: [], columnStyles: [] }),
    } as unknown as WasmWorkbook
    const result = readVisibleProjection(workbook, 0, {
      kind: 'visible-window', sheetId: 'sheet-1', requestId: 1,
      window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    }, 1)
    expect(result.cells[0]).toMatchObject({ displayValue: '1900-02-29',
      numericValue: 60, inputText: '=DATE(1900,2,29)' })
  })

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
        inputText: 'Northwind',
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

  test('formats numeric display text from the Rust format snapshot', () => {
    const workbook = {
      read_sparse_range: () => [
        {
          sheet: 0,
          addr: 'A1',
          display: '1234.5',
          type: 'number',
          isError: false,
          formula: '',
        },
      ],
      snapshot_format_range: () => ({
        cellStyles: [
          {
            addr: 'A1',
            format: { numberFormat: { kind: 'number', digits: 2, thousands: true } },
          },
        ],
        rowStyles: [],
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
        window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
      },
      1,
    )

    expect(result.cells[0]?.displayValue).toBe('1,234.50')
    expect(result.cells[0]?.numericValue).toBe(1234.5)
  })
})
