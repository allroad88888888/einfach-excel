import { expect, test } from 'vitest'
import {
  encodeSelectionAsHtml,
  encodeSelectionAsMarkdown,
  encodeSelectionAsPlainText,
} from '../../src'
import { exportClipboard } from '../../src/rust-workbook/clipboard-export'
import type { WasmWorkbook } from '../../src/rust-workbook/wasm-types'

test('Copy As encoders emit rowspan/colspan for merges, skip covered follower cells, and exclude filter-hidden rows', () => {
  const input = {
    rect: { startRow: 0, startCol: 0, endRow: 3, endCol: 2 },
    hiddenRows: [1],
    mergedRanges: [{ rowStart: 0, colStart: 0, rowEnd: 2, colEnd: 1 }],
    cells: [
      { row: 0, col: 0, displayValue: 'Merged Header', mergedSpan: { rows: 3, cols: 2 } },
      { row: 0, col: 1, displayValue: 'Covered stale B1' },
      { row: 0, col: 2, displayValue: 'R1C3' },
      { row: 1, col: 2, displayValue: 'Filtered out row' },
      { row: 2, col: 0, displayValue: 'Covered stale A3' },
      { row: 2, col: 2, displayValue: 'R3C3' },
      { row: 3, col: 0, displayValue: 'Footer A4' },
      { row: 3, col: 1, displayValue: 'Footer B4' },
      { row: 3, col: 2, displayValue: 'Footer C4' },
    ],
  }

  // Row 1 is filter-hidden, so the 3-row merge (rows 0..2) spans 2 visible rows in HTML!
  const html = encodeSelectionAsHtml(input)
  expect(html).toContain('rowspan="2" colspan="2"')
  expect(html).toContain('Merged Header')
  expect(html).not.toContain('Covered stale')
  expect(html).not.toContain('Filtered out row')
  expect((html.match(/<tr/g) ?? []).length).toBe(3)

  const tsv = encodeSelectionAsPlainText(input)
  expect(tsv).toBe(['Merged Header\t\tR1C3', '\t\tR3C3', 'Footer A4\tFooter B4\tFooter C4'].join('\n'))

  const md = encodeSelectionAsMarkdown(input)
  expect(md).toBe(
    [
      '| Merged Header |  | R1C3 |',
      '| --- | --- | --- |',
      '|  |  | R3C3 |',
      '| Footer A4 | Footer B4 | Footer C4 |',
    ].join('\n'),
  )
})

test('HTML encoder does not leak anchor text when the true merge anchor row is filter-hidden or outside selection', () => {
  const html = encodeSelectionAsHtml({
    rect: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    hiddenRows: [0],
    mergedRanges: [{ rowStart: 0, colStart: 0, rowEnd: 1, colEnd: 1 }],
    cells: [
      { row: 0, col: 0, displayValue: 'Hidden Anchor Secret', mergedSpan: { rows: 2, cols: 2 } },
      { row: 2, col: 0, displayValue: 'Visible A3' },
      { row: 2, col: 1, displayValue: 'Visible B3' },
    ],
  })
  expect(html).not.toContain('Hidden Anchor Secret')
  expect(html).toContain('colspan="2"')
  expect(html).toContain('Visible A3')
})

test('exportClipboard wires Rust mergeAnchors, mergedRanges, and filterRows into HTML/TSV/Markdown exports', () => {
  const fakeWorkbook: WasmWorkbook = {
    read_sparse_range: () => [
      {
        sheet: 0,
        addr: 'A1',
        display: 'Region Group',
        inputText: 'Region Group',
        cellType: 'text',
        isError: false,
        formula: '',
      },
      {
        sheet: 0,
        addr: 'C1',
        display: '100',
        inputText: '100',
        cellType: 'number',
        isError: false,
        formula: '',
      },
      {
        sheet: 0,
        addr: 'C2',
        display: '999',
        inputText: '999',
        cellType: 'number',
        isError: false,
        formula: '',
      },
      {
        sheet: 0,
        addr: 'C3',
        display: '200',
        inputText: '200',
        cellType: 'number',
        isError: false,
        formula: '',
      },
    ],
    snapshotCell: (_sheet, addr) =>
      addr === 'A1'
        ? {
            sheet: 0,
            addr: 'A1',
            display: 'Region Group',
            inputText: 'Region Group',
            cellType: 'text',
            isError: false,
            formula: '',
          }
        : null,
    snapshot_format_range: () => ({ cellStyles: [], rowStyles: [], columnStyles: [] }),
    merged_ranges: () => new Uint32Array([0, 0, 2, 1]),
    sheet_visibility: () => ({
      manualRows: [],
      manualColumns: [],
      outlineRows: [],
      outlineColumns: [],
      filterRows: [1],
    }),
  } as unknown as WasmWorkbook

  const htmlExport = exportClipboard(fakeWorkbook, 0, {
    sheetId: 's1',
    range: { rowStart: 0, colStart: 0, rowEnd: 2, colEnd: 2 },
    format: 'html',
  })
  expect(htmlExport.rows).toBe(2)
  expect(htmlExport.cols).toBe(3)
  expect(htmlExport.text).toBe('Region Group\t\t100\n\t\t200')
  expect(htmlExport.html).toContain('rowspan="2" colspan="2"')
  expect(htmlExport.html).not.toContain('999')
})
