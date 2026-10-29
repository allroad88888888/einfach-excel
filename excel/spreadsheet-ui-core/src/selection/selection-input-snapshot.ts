import { EXCEL_MAX_ROWS, EXCEL_MAX_COLS } from '../shared/grid-coordinates'
import type { CellCoord, CellRange } from '../shared'
import type { SelectionBounds, SelectionState } from './types'

export type SelectionInputSnapshot<T> =
  | { readonly kind: 'valid'; readonly value: T }
  | { readonly kind: 'invalid' }

export const MAX_SELECTION_REGIONS = 10_000
export const MAX_SELECTION_SHEET_ID_LENGTH = 512

export function validSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export function snapshotCellCoordInput(candidate: unknown): SelectionInputSnapshot<CellCoord> {
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const record = candidate as Record<string, unknown>
    const row = record.row
    const col = record.col
    if (!validSafeInteger(row) || !validSafeInteger(col)) return { kind: 'invalid' }
    return { kind: 'valid', value: Object.freeze({ row, col }) }
  } catch {
    return { kind: 'invalid' }
  }
}

export function snapshotSelectionBoundsInput(
  candidate: unknown,
): SelectionInputSnapshot<SelectionBounds> {
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const record = candidate as Record<string, unknown>
    const rowCount = record.rowCount
    const colCount = record.colCount
    if (
      !validSafeInteger(rowCount) ||
      rowCount < 1 ||
      rowCount > EXCEL_MAX_ROWS ||
      !validSafeInteger(colCount) ||
      colCount < 1 ||
      colCount > EXCEL_MAX_COLS
    ) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'valid',
      value: Object.freeze({ rowCount, colCount }),
    }
  } catch {
    return { kind: 'invalid' }
  }
}

export function snapshotSelectionInput(candidate: unknown): SelectionInputSnapshot<SelectionState> {
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const record = candidate as Record<string, unknown>
    const kind = record.kind
    const sheetId = record.sheetId
    if (typeof sheetId !== 'string' || sheetId.length > MAX_SELECTION_SHEET_ID_LENGTH) {
      return { kind: 'invalid' }
    }
    if (kind === 'cell' || kind === 'range') {
      const anchor = snapshotCellCoordInput(record.anchor)
      const focus = snapshotCellCoordInput(record.focus)
      if (anchor.kind === 'invalid' || focus.kind === 'invalid') return { kind: 'invalid' }
      return {
        kind: 'valid',
        value: Object.freeze({ kind, sheetId, anchor: anchor.value, focus: focus.value }),
      }
    }
    if (kind === 'row') {
      const rowAnchor = record.rowAnchor
      const rowFocus = record.rowFocus
      if (!validSafeInteger(rowAnchor) || !validSafeInteger(rowFocus)) {
        return { kind: 'invalid' }
      }
      return {
        kind: 'valid',
        value: Object.freeze({ kind, sheetId, rowAnchor, rowFocus }),
      }
    }
    if (kind === 'column') {
      const colAnchor = record.colAnchor
      const colFocus = record.colFocus
      if (!validSafeInteger(colAnchor) || !validSafeInteger(colFocus)) {
        return { kind: 'invalid' }
      }
      return {
        kind: 'valid',
        value: Object.freeze({ kind, sheetId, colAnchor, colFocus }),
      }
    }
    if (kind === 'all') {
      return { kind: 'valid', value: Object.freeze({ kind, sheetId }) }
    }
    return { kind: 'invalid' }
  } catch {
    return { kind: 'invalid' }
  }
}

export function snapshotCellRangeInput(candidate: unknown): SelectionInputSnapshot<CellRange> {
  if (candidate === null || typeof candidate !== 'object') return { kind: 'invalid' }
  try {
    const record = candidate as Record<string, unknown>
    const rowStart = record.rowStart
    const rowEnd = record.rowEnd
    const colStart = record.colStart
    const colEnd = record.colEnd
    if (
      !validSafeInteger(rowStart) ||
      !validSafeInteger(rowEnd) ||
      !validSafeInteger(colStart) ||
      !validSafeInteger(colEnd) ||
      rowStart < 0 ||
      rowEnd < rowStart ||
      colStart < 0 ||
      colEnd < colStart
    ) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'valid',
      value: Object.freeze({ rowStart, rowEnd, colStart, colEnd }),
    }
  } catch {
    return { kind: 'invalid' }
  }
}

export function snapshotOptionalSheetId(
  candidate: unknown,
): SelectionInputSnapshot<string | undefined> {
  return candidate === undefined ||
    (typeof candidate === 'string' && candidate.length <= MAX_SELECTION_SHEET_ID_LENGTH)
    ? { kind: 'valid', value: candidate }
    : { kind: 'invalid' }
}

export function snapshotOptionalBoolean(
  candidate: unknown,
): SelectionInputSnapshot<boolean | undefined> {
  return candidate === undefined || typeof candidate === 'boolean'
    ? { kind: 'valid', value: candidate }
    : { kind: 'invalid' }
}
