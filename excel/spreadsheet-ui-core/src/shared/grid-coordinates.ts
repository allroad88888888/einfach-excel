import type { CellRange } from './types'

export function rangeEquals(a: CellRange, b: CellRange): boolean {
  return a.rowStart === b.rowStart && a.rowEnd === b.rowEnd &&
    a.colStart === b.colStart && a.colEnd === b.colEnd
}

/** Creates stable identifiers and labels for zero-based grid coordinates. */
export function keyFor(row: number, col: number): string {
  return `${row}:${col}`
}

export function isCoordInsideRange(row: number, col: number, range: CellRange): boolean {
  return (
    row >= range.rowStart && row <= range.rowEnd && col >= range.colStart && col <= range.colEnd
  )
}

export function getWindowIndexes(start: number, end: number): number[] {
  if (end < start) return []
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export function getColumnLabel(index: number): string {
  let value = index + 1
  let label = ''

  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }

  return label
}

export function toA1(row: number, col: number): string {
  return `${getColumnLabel(col)}${row + 1}`
}
