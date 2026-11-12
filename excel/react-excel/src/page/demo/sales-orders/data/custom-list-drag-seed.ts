import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** D55:D59 is reserved for saved-list drag: source, two blank targets, sentinel. */
export const SUMMARY_CUSTOM_LIST_DRAG_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 54, col: 3, kind: 'text', value: 'Medium', format: { underline: true } },
  { sheet: 1, row: 55, col: 3, kind: 'text', value: 'High', format: { underline: true } },
  { sheet: 1, row: 58, col: 3, kind: 'number', value: 901, format: { bold: true } },
]
