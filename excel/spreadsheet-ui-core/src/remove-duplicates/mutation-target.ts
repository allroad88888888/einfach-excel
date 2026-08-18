import type { BackendStructuralShift, ProjectionRevision } from '../backend/types'
import type { CellRange } from '../shared'
import { snapshotRange, validRange } from './domain'
import type { RemoveDuplicatesRange } from './types'

export function canonicalRows(rows: readonly number[]): readonly number[] | null {
  if (rows.some((row) => !Number.isSafeInteger(row) || row < 0)) return null
  return Object.freeze(Array.from(new Set(rows)).sort((left, right) => left - right))
}

export function targetRangeFor(
  range: RemoveDuplicatesRange,
  rows: readonly number[],
): Readonly<CellRange> | null {
  if (rows.length === 0) return null
  return snapshotRange({
    rowStart: Math.min(range.startRow, rows[0]),
    rowEnd: Math.max(range.endRow, rows[rows.length - 1]),
    colStart: range.startCol,
    colEnd: range.endCol,
  })
}

export function targetKeyFor(
  sheetId: string,
  targetRange: CellRange,
  revision: ProjectionRevision,
  rows: readonly number[],
): string {
  return JSON.stringify([
    sheetId,
    targetRange.rowStart,
    targetRange.rowEnd,
    targetRange.colStart,
    targetRange.colEnd,
    typeof revision,
    revision,
    rows,
  ])
}

export function sameNumberList(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function descendingRowDeleteShifts(
  rows: readonly number[],
): readonly Readonly<BackendStructuralShift>[] {
  const shifts: BackendStructuralShift[] = []
  for (const row of rows) {
    const band = shifts[0]
    if (band !== undefined && row === band.index + band.count) band.count += 1
    else shifts.unshift({ axis: 'row', kind: 'delete', index: row, count: 1 })
  }
  return shifts
}

export function snapshotCellRangeValue(value: unknown): Readonly<CellRange> | null {
  try {
    if (typeof value !== 'object' || value === null) return null
    const range = value as CellRange
    const rowStart = range.rowStart
    const rowEnd = range.rowEnd
    const colStart = range.colStart
    const colEnd = range.colEnd
    const snapshot = Object.freeze({ rowStart, rowEnd, colStart, colEnd })
    return validRange(snapshot) ? snapshot : null
  } catch {
    return null
  }
}
