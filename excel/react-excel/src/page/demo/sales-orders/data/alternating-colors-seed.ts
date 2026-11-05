import type { RustImportCell, RustWorkbookSheetInput } from '@einfach-excel/spreadsheet-ui-core'

/** H85:H89 is initialized through Rust's ordinary conditional-format definitions. */
export const SUMMARY_BANDING_RULE: NonNullable<RustWorkbookSheetInput['conditionalFormats']>[number] = {
  scope: { range: { rowStart: 84, rowEnd: 88, colStart: 7, colEnd: 7 } },
  rule: { kind: 'formula', formula: '=MOD(ROW()-ROW($H$85),2)=1', format: { bgColor: '#e8f0fe' } },
}
export const SUMMARY_BANDING_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 84, col: 7, kind: 'text', value: 'Alternating colors', format: { bold: true } },
  ...['North', 'South', 'East', 'West'].map((value, index) => ({
    sheet: 1, row: 85 + index, col: 7, kind: 'text' as const, value,
  })),
]
