import type { RustImportCell, RustWorkbookSheetInput } from '@einfach-excel/spreadsheet-ui-core'

/** A35 stays truly absent; all twelve A35:C38 positions belong to these native examples. */
export const SUMMARY_CONDITIONAL_STATE_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 34, col: 1, kind: 'text', value: '' },
  { sheet: 1, row: 34, col: 2, kind: 'formula', value: '=""' },
  { sheet: 1, row: 35, col: 0, kind: 'text', value: '   ' },
  { sheet: 1, row: 35, col: 1, kind: 'formula', value: '=1/0' },
  { sheet: 1, row: 35, col: 2, kind: 'text', value: '#DIV/0!' },
  { sheet: 1, row: 36, col: 0, kind: 'number', value: 0 },
  { sheet: 1, row: 36, col: 1, kind: 'boolean', value: true },
  { sheet: 1, row: 36, col: 2, kind: 'text', value: '\t' },
  { sheet: 1, row: 37, col: 0, kind: 'text', value: '\u00a0' },
  { sheet: 1, row: 37, col: 1, kind: 'formula', value: '=NA()' },
  { sheet: 1, row: 37, col: 2, kind: 'text', value: 'Text' },
]

export const SUMMARY_CONDITIONAL_STATE_RULES: NonNullable<RustWorkbookSheetInput['conditionalFormats']> = [
  { scope: { range: { rowStart: 34, rowEnd: 37, colStart: 0, colEnd: 2 } },
    rule: { kind: 'cell-state', condition: 'blank', format: { bgColor: '#e2f0d9' } } },
  { scope: { range: { rowStart: 34, rowEnd: 37, colStart: 0, colEnd: 2 } },
    rule: { kind: 'cell-state', condition: 'error', format: { bgColor: '#ffc7ce' } } },
]
