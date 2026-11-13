import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** C5:D7: real native examples; C remains a normal baseline reference. */
export const SUMMARY_FONT_BASELINE_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 4, col: 2, kind: 'text', value: 'Normal text', format: { fontSize: 16 } },
  { sheet: 1, row: 4, col: 3, kind: 'text', value: 'Superscript',
    format: { fontSize: 16, fontBaseline: 'superscript' } },
  { sheet: 1, row: 5, col: 2, kind: 'text', value: 'Normal text', format: { fontSize: 16 } },
  { sheet: 1, row: 5, col: 3, kind: 'text', value: 'Subscript',
    format: { fontSize: 16, fontBaseline: 'subscript' } },
  { sheet: 1, row: 6, col: 2, kind: 'number', value: 12345, format: { fontSize: 16 } },
  { sheet: 1, row: 6, col: 3, kind: 'formula', value: '=C7*2',
    format: { fontSize: 16, fontBaseline: 'superscript' } },
]
