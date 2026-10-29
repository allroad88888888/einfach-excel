import type { NativeOutline, RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** Summary 8–12 行含一个子组；E:G 列保留原有手动隐藏 G 列作为交叉示例。 */
export const SUMMARY_OUTLINE: NativeOutline = {
  rows: [{ start: 7, end: 11, collapsed: false }, { start: 8, end: 10, collapsed: false }],
  columns: [{ start: 4, end: 6, collapsed: false }],
}
export const SUMMARY_OUTLINE_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 7, col: 0, kind: 'text', value: 'Outline' },
  { sheet: 1, row: 8, col: 0, kind: 'text', value: 'Detail 1' },
  { sheet: 1, row: 8, col: 1, kind: 'number', value: 10 },
  { sheet: 1, row: 10, col: 0, kind: 'text', value: 'Detail 2' },
  { sheet: 1, row: 10, col: 1, kind: 'number', value: 20 },
  { sheet: 1, row: 11, col: 0, kind: 'text', value: 'Subtotal' },
  { sheet: 1, row: 11, col: 1, kind: 'formula', value: '=SUBTOTAL(109,B9:B11)' },
]
