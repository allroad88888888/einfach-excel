import type { RustImportCell, RustWorkbookSheetInput } from '@einfach-excel/spreadsheet-ui-core'

/** The complete A14:F14 numeric domain has mean 12.5, so C14 and D14 highlight. */
export const SUMMARY_CONDITIONAL_AVERAGE_CELLS: readonly RustImportCell[] = [
  ...[0, 10, 20].map((value, col): RustImportCell => ({ sheet: 1, row: 13, col,
    kind: 'number', value })),
  { sheet: 1, row: 13, col: 3, kind: 'formula', value: '=B14*2' },
  { sheet: 1, row: 13, col: 4, kind: 'text', value: '999' },
  { sheet: 1, row: 13, col: 5, kind: 'formula', value: '=1/0' },
]

export const SUMMARY_CONDITIONAL_AVERAGE_RULE: NonNullable<RustWorkbookSheetInput['conditionalFormats']>[number] = {
  scope: { range: { rowStart: 13, rowEnd: 13, colStart: 0, colEnd: 5 } },
  rule: { kind: 'above-average', direction: 'above', format: { bgColor: '#e2f0d9' } },
}
