import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** Visible H15:H17 examples, outside existing merges, hidden axes and validation ranges. */
export const SUMMARY_PATTERN_FILL_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 14, col: 7, kind: 'text', value: 'Pattern fill',
    format: { bgColor: '#fff2cc', fill: { kind: 'pattern', pattern: 'lightDown', foreground: '#c00000' } } },
  { sheet: 1, row: 15, col: 7, kind: 'null',
    format: { bgColor: '#e2f0d9', fill: { kind: 'pattern', pattern: 'gray125', foreground: '#008000' } } },
  { sheet: 1, row: 16, col: 7, kind: 'text', value: 'Grid pattern',
    format: { bgColor: '#ddebf7', fill: { kind: 'pattern', pattern: 'lightGrid', foreground: '#0070c0' } } },
]
