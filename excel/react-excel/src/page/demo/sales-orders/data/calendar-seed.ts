import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** F19:F24/H19:H25 are free, unmerged native calendar examples. */
export const SUMMARY_CALENDAR_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 18, col: 5, kind: 'text', value: 'Weekday dates', format: { bold: true } },
  { sheet: 1, row: 19, col: 5, kind: 'number', value: 45352.5,
    format: { italic: true, numberFormat: { kind: 'custom', pattern: 'yyyy-mm-dd hh:mm' } } },
  { sheet: 1, row: 23, col: 5, kind: 'number', value: 901, format: { bold: true } },
  { sheet: 1, row: 18, col: 7, kind: 'text', value: 'Yearly dates', format: { bold: true } },
  { sheet: 1, row: 19, col: 7, kind: 'number', value: 45351.25,
    format: { underline: true, numberFormat: { kind: 'custom', pattern: 'yyyy-mm-dd hh:mm' } } },
  { sheet: 1, row: 24, col: 7, kind: 'number', value: 902, format: { bold: true } },
]
