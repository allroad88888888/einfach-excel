import type { CellRange } from '@einfach/spreadsheet-ui-core'

export const GRID_ROW_HEADER_WIDTH = 44
export const OUTLINE_GUTTER_SLOT_PX = 14
export const OUTLINE_GUTTER_PADDING_PX = 6
export const CLIPBOARD_CELL_LIMIT = 10_000

export function makeCellKey(row: number, col: number): string {
  return `${row}:${col}`
}

export function getWindowIndexes(start: number, end: number): number[] {
  if (end < start) return []
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function getColumnLabel(index: number): string {
  let n = index + 1
  let label = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    n = Math.floor((n - 1) / 26)
  }
  return label
}

export function getCellAddress(row: number, col: number): string {
  return `${getColumnLabel(col)}${row + 1}`
}

export function isCoordInRange(row: number, col: number, range: CellRange): boolean {
  return row >= range.rowStart && row <= range.rowEnd && col >= range.colStart && col <= range.colEnd
}
