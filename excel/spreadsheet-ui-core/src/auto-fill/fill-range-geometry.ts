import type { CellRange } from '../shared'

export function sameRange(left: Readonly<CellRange>, right: Readonly<CellRange>): boolean {
  return (
    left.rowStart === right.rowStart &&
    left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart &&
    left.colEnd === right.colEnd
  )
}

export function copyRange(range: Readonly<CellRange>): CellRange {
  return {
    rowStart: range.rowStart,
    rowEnd: range.rowEnd,
    colStart: range.colStart,
    colEnd: range.colEnd,
  }
}

export function normalizeRange(range: Readonly<CellRange>): CellRange {
  return {
    rowStart: Math.min(range.rowStart, range.rowEnd),
    rowEnd: Math.max(range.rowStart, range.rowEnd),
    colStart: Math.min(range.colStart, range.colEnd),
    colEnd: Math.max(range.colStart, range.colEnd),
  }
}

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}

export function rangeCellCount(range: Readonly<CellRange>): number {
  return (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
}

export function affectedRangeForWrites(
  writes: readonly { row: number; col: number }[],
): CellRange | null {
  const first = writes[0]
  if (!first) return null
  const range = {
    rowStart: first.row,
    rowEnd: first.row,
    colStart: first.col,
    colEnd: first.col,
  }
  for (const write of writes.slice(1)) {
    range.rowStart = Math.min(range.rowStart, write.row)
    range.rowEnd = Math.max(range.rowEnd, write.row)
    range.colStart = Math.min(range.colStart, write.col)
    range.colEnd = Math.max(range.colEnd, write.col)
  }
  return range
}
