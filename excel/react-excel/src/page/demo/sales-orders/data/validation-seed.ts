import type { RustImportCell, RustWorkbookSheetInput } from '@einfach/spreadsheet-ui-core'

/** H45:H47 分别演示整数、小数、列表；规则与初始值都交给 Rust。 */
export const SUMMARY_VALIDATION_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 44, col: 5, kind: 'text', value: 'Integer 1–10' },
  { sheet: 1, row: 45, col: 5, kind: 'text', value: 'Decimal 0–1' },
  { sheet: 1, row: 46, col: 5, kind: 'text', value: 'Choose status' },
  { sheet: 1, row: 44, col: 7, kind: 'number', value: 5 },
  { sheet: 1, row: 45, col: 7, kind: 'number', value: 0.5 },
  { sheet: 1, row: 46, col: 7, kind: 'text', value: 'Ready' },
]
export const SUMMARY_VALIDATIONS: RustWorkbookSheetInput['dataValidations'] = [
  { range: { rowStart: 44, rowEnd: 44, colStart: 7, colEnd: 7 },
    rule: { kind: 'whole-number', min: 1, max: 10, ignoreBlank: true } },
  { range: { rowStart: 45, rowEnd: 45, colStart: 7, colEnd: 7 },
    rule: { kind: 'decimal', min: 0, max: 1, ignoreBlank: true } },
  { range: { rowStart: 46, rowEnd: 46, colStart: 7, colEnd: 7 },
    rule: { kind: 'list', items: ['Ready', 'On hold', '001', '=1+2'], ignoreBlank: true } },
]
