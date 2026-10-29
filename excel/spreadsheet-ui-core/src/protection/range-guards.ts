import type { CellRange } from '../shared'

export function snapshotRange(range: Readonly<CellRange>): Readonly<CellRange> {
  return Object.freeze({
    rowStart: range.rowStart,
    rowEnd: range.rowEnd,
    colStart: range.colStart,
    colEnd: range.colEnd,
  })
}

export function rangesIntersect(a: Readonly<CellRange>, b: Readonly<CellRange>): boolean {
  return (
    a.rowStart <= b.rowEnd &&
    a.rowEnd >= b.rowStart &&
    a.colStart <= b.colEnd &&
    a.colEnd >= b.colStart
  )
}

export function isCellRange(value: unknown): value is CellRange {
  if (typeof value !== 'object' || value === null) return false
  const range = value as Partial<CellRange>
  return (
    Number.isSafeInteger(range.rowStart) &&
    Number.isSafeInteger(range.rowEnd) &&
    Number.isSafeInteger(range.colStart) &&
    Number.isSafeInteger(range.colEnd) &&
    (range.rowStart ?? -1) >= 0 &&
    (range.colStart ?? -1) >= 0 &&
    (range.rowEnd ?? -1) >= (range.rowStart ?? 0) &&
    (range.colEnd ?? -1) >= (range.colStart ?? 0)
  )
}

export function rangesEqual(first: Readonly<CellRange>, second: Readonly<CellRange>): boolean {
  return (
    first.rowStart === second.rowStart &&
    first.rowEnd === second.rowEnd &&
    first.colStart === second.colStart &&
    first.colEnd === second.colEnd
  )
}
