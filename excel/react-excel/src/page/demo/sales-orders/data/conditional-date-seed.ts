import type { RustImportCell, RustWorkbookSheetInput } from '@einfach-excel/spreadsheet-ui-core'

/** A13:F13 is a separate, unmerged Summary example; only today's native dates highlight. */
export const SUMMARY_CONDITIONAL_DATE_CELLS: readonly RustImportCell[] = [
  ...['=TODAY()-1', '=TODAY()', '=TODAY()+0.75', '=TODAY()+1'].map((value, col): RustImportCell => ({
    sheet: 1, row: 12, col, kind: 'formula', value,
    format: { numberFormat: { kind: 'date', pattern: 'yyyy-mm-dd' } },
  })),
  { sheet: 1, row: 12, col: 4, kind: 'text', value: '2026-11-12' },
  { sheet: 1, row: 12, col: 5, kind: 'formula', value: '=1/0' },
]

export const SUMMARY_CONDITIONAL_DATE_RULE: NonNullable<RustWorkbookSheetInput['conditionalFormats']>[number] = {
  scope: { range: { rowStart: 12, rowEnd: 12, colStart: 0, colEnd: 5 } },
  rule: { kind: 'time-period', period: 'today', format: { bgColor: '#e2f0d9' } },
}
