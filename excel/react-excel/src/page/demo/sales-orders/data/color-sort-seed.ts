import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** A75:B78 can be sorted by the fill or font color of its Priority column. */
export const SUMMARY_COLOR_SORT_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 74, col: 0, kind: 'text', value: 'Priority', format: { bold: true } },
  { sheet: 1, row: 74, col: 1, kind: 'text', value: 'Order', format: { bold: true } },
  { sheet: 1, row: 75, col: 0, kind: 'text', value: 'Routine', format: { fgColor: '#008000' } },
  { sheet: 1, row: 75, col: 1, kind: 'text', value: 'Follow-up' },
  { sheet: 1, row: 76, col: 0, kind: 'text', value: 'Urgent',
    format: { bgColor: '#f4cccc', fgColor: '#c00000' } },
  { sheet: 1, row: 76, col: 1, kind: 'text', value: 'Review today' },
  { sheet: 1, row: 77, col: 0, kind: 'text', value: 'Pending', format: { bgColor: '#fff2cc' } },
  { sheet: 1, row: 77, col: 1, kind: 'text', value: 'Confirm delivery' },
]
