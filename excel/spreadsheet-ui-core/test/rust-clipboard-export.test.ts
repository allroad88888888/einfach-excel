import { describe, expect, test, vi } from 'vitest'
import { exportClipboard } from '../src/rust-workbook/clipboard-export'
import type { RustClipboardExportRequest } from '../src/rust-workbook/clipboard-commands'
import type { WasmWorkbook } from '../src/rust-workbook/wasm-types'

function fixture() {
  const read = vi.fn(() => [
    { addr: 'B2', type: 'text', display: '<script>alert(1)</script>', isError: false, formula: '' },
    { addr: 'C3', type: 'number', display: '125.02', isError: false, formula: '=1+124.02' },
  ])
  const workbook = {
    read_sparse_range: read,
    snapshot_format_range: () => ({
      rowStyles: [{ index: 1, format: { bold: true } }],
      columnStyles: [],
      cellStyles: [
        { addr: 'C3', format: { numberFormat: { kind: 'currency', symbol: '$', digits: 0 } } },
      ],
    }),
  } as unknown as WasmWorkbook
  const request: RustClipboardExportRequest = {
    sheetId: 'orders',
    format: 'text',
    range: { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
  }
  return { read, workbook, request }
}

describe('Rust-backed clipboard export', () => {
  test('Markdown escapes user links and emphasis before adding workbook formatting', () => {
    const { workbook, request, read } = fixture()
    read.mockReturnValueOnce([
      {
        addr: 'B2',
        type: 'text',
        display: '![x](https://example.test) *literal* <b>',
        isError: false,
        formula: '',
      },
    ])
    const result = exportClipboard(workbook, 0, { ...request, format: 'markdown' })
    expect(result.text).toContain('\\!\\[x\\](https://example.test) \\*literal\\* &lt;b&gt;')
    expect(result.text).not.toContain('![x]')
  })

  test('rejects oversized UTF-8 output rather than publishing a partial clipboard', () => {
    const { workbook, request, read } = fixture()
    read.mockReturnValueOnce([
      {
        addr: 'B2',
        type: 'text',
        display: '字'.repeat(6_000_000),
        isError: false,
        formula: '',
      },
    ])
    expect(() => exportClipboard(workbook, 0, request)).toThrow('CLIPBOARD_TOO_LARGE')
  })

  test('reads exactly the requested rectangle and preserves empty slots and formatted values', () => {
    const { workbook, request, read } = fixture()
    expect(exportClipboard(workbook, 2, request)).toEqual({
      text: '<script>alert(1)</script>\t\n\t$125',
      rows: 2,
      cols: 2,
    })
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith(2, 1, 1, 2, 2)
  })

  test('HTML keeps native effective formatting and escapes executable cell text', () => {
    const { workbook, request } = fixture()
    const result = exportClipboard(workbook, 0, { ...request, format: 'html' })
    expect(result.html).toContain('<table')
    expect(result.html).toContain('font-weight: bold')
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('$125')
    expect(result.html).not.toContain('=1+124.02')
    expect(result).not.toHaveProperty('token')
  })

  test('Markdown has a header separator and uses formatted values instead of formulas', () => {
    const { workbook, request } = fixture()
    const result = exportClipboard(workbook, 0, { ...request, format: 'markdown' })
    expect(result.text).toContain('| --- | --- |')
    expect(result.text).toContain('$125')
    expect(result.text).not.toContain('<script>')
    expect(result.text).toContain('&lt;script&gt;')
    expect(result.text).not.toContain('=1+124.02')
    expect(result).not.toHaveProperty('html')
  })

  test.each([
    { rowStart: -1, rowEnd: 2, colStart: 0, colEnd: 1 },
    { rowStart: 2, rowEnd: 1, colStart: 0, colEnd: 1 },
    { rowStart: 0, rowEnd: 1_048_576, colStart: 0, colEnd: 0 },
    { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 16_384 },
    { rowStart: 0.5, rowEnd: 2, colStart: 0, colEnd: 0 },
  ])('rejects invalid geometry before reading native data: %j', (range) => {
    const { workbook, request, read } = fixture()
    expect(() => exportClipboard(workbook, 0, { ...request, range })).toThrow(
      'CLIPBOARD_INVALID_RANGE',
    )
    expect(read).not.toHaveBeenCalled()
  })

  test('rejects excessive cells and unknown formats before reading', () => {
    const { workbook, request, read } = fixture()
    expect(() =>
      exportClipboard(workbook, 0, {
        ...request,
        range: { rowStart: 0, rowEnd: 100_000, colStart: 0, colEnd: 0 },
      }),
    ).toThrow('CLIPBOARD_TOO_LARGE')
    expect(() =>
      exportClipboard(workbook, 0, {
        ...request,
        format: 'unknown' as RustClipboardExportRequest['format'],
      }),
    ).toThrow('CLIPBOARD_INVALID_MODE')
    expect(read).not.toHaveBeenCalled()
  })
})
