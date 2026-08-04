// 一句话：以 "row:col" 为键的单元格 Map 的坐标级操作。

import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import { keyFor } from '@einfach/spreadsheet-ui-core'

export function parseKey(key: string): { row: number; col: number } | null {
  const [rowPart, colPart] = key.split(':')
  const row = Number(rowPart)
  const col = Number(colPart)
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null
  return { row, col }
}

export function compareCells(left: DisplayCell, right: DisplayCell): number {
  return left.row === right.row ? left.col - right.col : left.row - right.row
}

export function upsertBlankCell(
  cells: Map<string, DisplayCell>,
  row: number,
  col: number,
): DisplayCell {
  const key = keyFor(row, col)
  let cell = cells.get(key)
  if (!cell) {
    cell = {
      row,
      col,
      displayValue: '',
      valueKind: 'blank',
    }
    cells.set(key, cell)
  }
  return cell
}

export function isCellInsideRange(
  cell: DisplayCell,
  range: { rowStart: number; rowEnd: number; colStart: number; colEnd: number },
): boolean {
  return (
    cell.row >= range.rowStart &&
    cell.row <= range.rowEnd &&
    cell.col >= range.colStart &&
    cell.col <= range.colEnd
  )
}
