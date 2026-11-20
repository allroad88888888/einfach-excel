import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** C8:D9 and C11:D11: native inline overrides, including explicit normal inheritance. */
export const SUMMARY_RICH_BASELINE_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 7, col: 2, kind: 'text', value: 'Inline exponent' },
  { sheet: 1, row: 7, col: 3, kind: 'text', value: 'x2', format: { fontSize: 16 }, richText: [
    { text: 'x', format: {} }, { text: '2', format: { fontBaseline: 'superscript' } },
  ] },
  { sheet: 1, row: 8, col: 2, kind: 'text', value: 'Inline subscript' },
  { sheet: 1, row: 8, col: 3, kind: 'text', value: 'H2O', format: { fontSize: 16 }, richText: [
    { text: 'H', format: {} }, { text: '2', format: { fontBaseline: 'subscript' } },
    { text: 'O', format: {} },
  ] },
  { sheet: 1, row: 10, col: 2, kind: 'text', value: 'Inherited baseline' },
  { sheet: 1, row: 10, col: 3, kind: 'text', value: 'AB',
    format: { fontSize: 16, fontBaseline: 'superscript' }, richText: [
      { text: 'A', format: {} }, { text: 'B', format: { fontBaseline: 'normal' } },
    ] },
]
