import type { CellRange, RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** Wider than the buffered viewport, with anchors that can scroll off both axes. */
export const SALES_ORDER_MERGE_COLUMN_COUNT = 128

/** Small merge samples spread through the first 257 rows. */
const smallMerges: CellRange[] = Array.from({ length: 20 }, (_, group) => {
  const row = 20 + group * 12
  return [
    { rowStart: row, rowEnd: row, colStart: 0, colEnd: 2 },
    { rowStart: row + 2, rowEnd: row + 4, colStart: 3, colEnd: 3 },
    { rowStart: row + 6, rowEnd: row + 8, colStart: 1, colEnd: 3 },
  ]
}).flat()

export const SALES_ORDER_MERGES: readonly CellRange[] = [
  ...smallMerges,
  { rowStart: 280, rowEnd: 283, colStart: 1, colEnd: 95 },
  { rowStart: 320, rowEnd: 325, colStart: 8, colEnd: 127 },
  { rowStart: 380, rowEnd: 559, colStart: 2, colEnd: 79 },
  { rowStart: 340, rowEnd: 939, colStart: 0, colEnd: 0 },
  { rowStart: 340, rowEnd: 989, colStart: 84, colEnd: 85 },
  { rowStart: 340, rowEnd: 999, colStart: 89, colEnd: 92 },
]

const mergedCells = new Map<string, { anchor: boolean; index: number }>()
for (const [index, range] of SALES_ORDER_MERGES.entries()) {
  for (let row = range.rowStart; row <= range.rowEnd; row++) {
    for (let col = range.colStart; col <= range.colEnd; col++) {
      mergedCells.set(`${row}:${col}`, {
        anchor: row === range.rowStart && col === range.colStart, index,
      })
    }
  }
}

/** Replace covered demo values with blanks; only the merge anchor contains text. */
export function applySalesOrderMerge(cell: RustImportCell): RustImportCell {
  const merge = mergedCells.get(`${cell.row}:${cell.col}`)
  if (!merge) return cell
  if (!merge.anchor) return { sheet: cell.sheet, row: cell.row, col: cell.col, kind: 'null' }
  const variant = merge.index % 3
  const labels = ['横向合并 · 1 × 3', '纵向合并\n3 × 1', '区域合并 · 3 × 3\n滚动 / 选中 / 编辑']
  const range = SALES_ORDER_MERGES[merge.index]!
  const label = merge.index < 60 ? labels[variant]
    : `超大合并 · ${range.rowEnd - range.rowStart + 1} 行 × ${range.colEnd - range.colStart + 1} 列`
  return {
    sheet: cell.sheet, row: cell.row, col: cell.col, kind: 'text',
    value: `#${String(merge.index + 1).padStart(2, '0')} ${label}`,
    format: {
      bold: true, align: 'center', verticalAlign: 'center', wrap: true,
      bgColor: ['#e9edff', '#fff2cc', '#e2f0d9'][variant], fgColor: '#24364b',
      borders: {
        top: { style: 'thin', color: '#8b9db5' },
        bottom: { style: 'thin', color: '#8b9db5' },
        left: { style: 'thin', color: '#8b9db5' },
        right: { style: 'thin', color: '#8b9db5' },
      },
    },
  }
}

/** Extra anchors beyond the original sixteen order-data columns. */
export const SALES_ORDER_EXTRA_MERGE_CELLS: readonly RustImportCell[] = SALES_ORDER_MERGES
  .filter(range => range.colStart >= 16)
  .map(range => applySalesOrderMerge({
    sheet: 0, row: range.rowStart, col: range.colStart, kind: 'null',
  }))
