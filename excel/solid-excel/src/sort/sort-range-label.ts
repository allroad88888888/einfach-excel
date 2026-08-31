import { toA1, type CellRange } from '@einfach/spreadsheet-ui-core'

export function formatSortRange(range: CellRange): string {
  return `${toA1(range.rowStart, range.colStart)}:${toA1(range.rowEnd, range.colEnd)}`
}

export function formatSortColumn(colIndex: number): string {
  return toA1(0, colIndex).slice(0, -1)
}
