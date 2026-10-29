import type { RustImportCell, RustWorkbookSheetInput } from '@einfach-excel/spreadsheet-ui-core'

/** E85:F89 演示文本、重复值和 Stop；不覆盖原有查找、统计或尺寸样例。 */
export const SUMMARY_CONDITIONAL_TEXT_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 83, col: 4, kind: 'text', value: 'Text / Stop if true' },
  { sheet: 1, row: 83, col: 5, kind: 'text', value: 'Duplicate / unique' },
  ...['Ready', 'ready', 'Review', 'On hold'].map((value, index) =>
    ({ sheet: 1, row: 84 + index, col: 4, kind: 'text' as const, value })),
  { sheet: 1, row: 88, col: 4, kind: 'formula', value: '=E85' },
  ...['Cedar', 'cedar', 'Birch'].map((value, index) =>
    ({ sheet: 1, row: 84 + index, col: 5, kind: 'text' as const, value })),
  { sheet: 1, row: 87, col: 5, kind: 'formula', value: '=F85' },
  { sheet: 1, row: 88, col: 5, kind: 'formula', value: '=""' },
]
export const SUMMARY_CONDITIONAL_TEXT_RULES: NonNullable<RustWorkbookSheetInput['conditionalFormats']> = [
  { scope: { range: { rowStart: 84, rowEnd: 88, colStart: 4, colEnd: 4 } },
    rule: { kind: 'text', condition: 'contains', text: 'ready', stopIfTrue: true,
      format: { bgColor: '#e2f0d9' } } },
  { scope: { range: { rowStart: 84, rowEnd: 88, colStart: 5, colEnd: 5 } },
    rule: { kind: 'duplicate-values', mode: 'duplicate', format: { bgColor: '#ffc7ce' } } },
  { scope: { range: { rowStart: 84, rowEnd: 88, colStart: 4, colEnd: 4 } },
    rule: { kind: 'text', condition: 'contains', text: 'e', format: { italic: true } } },
]
