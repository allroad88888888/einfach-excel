import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** Native F15:F17 examples persist even when the appearance editor plugin is not installed. */
export const SUMMARY_DIAGONAL_BORDER_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 14, col: 5, kind: 'text', value: 'Down diagonal',
    format: { borders: { diagDown: { style: 'thin', color: '#c00000' } } } },
  { sheet: 1, row: 15, col: 5, kind: 'text', value: 'Up diagonal',
    format: { borders: { diagUp: { style: 'dashed', color: '#123abc' } } } },
  { sheet: 1, row: 16, col: 5, kind: 'text', value: 'Both diagonals',
    format: { borders: { diagDown: { style: 'double', color: '#008000' },
      diagUp: { style: 'double', color: '#008000' } } } },
]
