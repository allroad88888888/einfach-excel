import type { CellRange } from '../shared'

/** Advances request/session identities without wrapping to an already-used positive value. */
export function nextSafeMonotonicIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

export function nextTextToColumnsSessionId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}

export function nextTextToColumnsRequestId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}

export function snapshotRange(range: CellRange): CellRange {
  return Object.freeze({
    rowStart: range.rowStart,
    rowEnd: range.rowEnd,
    colStart: range.colStart,
    colEnd: range.colEnd,
  })
}

export function sameRange(left: CellRange, right: CellRange): boolean {
  return left.rowStart === right.rowStart && left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart && left.colEnd === right.colEnd
}

export function isValidCellRange(range: CellRange): boolean {
  return Number.isSafeInteger(range.rowStart) && Number.isSafeInteger(range.rowEnd) &&
    Number.isSafeInteger(range.colStart) && Number.isSafeInteger(range.colEnd) &&
    range.rowStart >= 0 && range.colStart >= 0 && range.rowStart <= range.rowEnd && range.colStart <= range.colEnd
}
