import type { RangeProjectionRequest, RangeProjectionResult } from '../backend'
import type { CellRange } from '../shared'
import { GO_TO_SCAN_MAX_CELLS, type GoToCandidateCell } from './types'

export function computeGoToScanRange(rowCount: number, colCount: number): CellRange {
  const rows = Math.max(1, Math.trunc(rowCount) || 1)
  const cols = Math.max(1, Math.trunc(colCount) || 1)
  return Object.freeze({
    rowStart: 0,
    rowEnd: rows - 1,
    colStart: 0,
    colEnd: cols - 1,
  })
}

export function clipGoToScanRange(range: CellRange): CellRange {
  const columns = range.colEnd - range.colStart + 1
  const rows = range.rowEnd - range.rowStart + 1
  if (columns <= 0 || rows <= 0) return range
  const clippedColumns = Math.min(columns, GO_TO_SCAN_MAX_CELLS)
  const maxRows = Math.max(1, Math.floor(GO_TO_SCAN_MAX_CELLS / clippedColumns))
  const clippedRows = Math.min(rows, maxRows)
  if (clippedColumns === columns && clippedRows === rows) return range
  return Object.freeze({
    rowStart: range.rowStart,
    rowEnd: range.rowStart + clippedRows - 1,
    colStart: range.colStart,
    colEnd: range.colStart + clippedColumns - 1,
  })
}

export function sameRange(left: CellRange, right: CellRange): boolean {
  return (
    left.rowStart === right.rowStart &&
    left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart &&
    left.colEnd === right.colEnd
  )
}

export function cellIsInsideRange(
  cell: RangeProjectionResult['cells'][number],
  range: CellRange,
): boolean {
  return (
    cell.row >= range.rowStart &&
    cell.row <= range.rowEnd &&
    cell.col >= range.colStart &&
    cell.col <= range.colEnd
  )
}

export function projectionMatchesRequest(
  projection: RangeProjectionResult,
  request: RangeProjectionRequest,
): boolean {
  return (
    projection.kind === request.kind &&
    projection.requestId === request.requestId &&
    projection.sheetId === request.sheetId &&
    sameRange(projection.range, request.range)
  )
}

export function toGoToCandidate(cell: RangeProjectionResult['cells'][number]): GoToCandidateCell {
  return {
    row: cell.row,
    col: cell.col,
    displayValue: cell.displayValue ?? '',
    valueKind: cell.valueKind,
    formula: cell.formula,
    commentThreadId: cell.commentThreadId,
    conditionalFormat: cell.conditionalFormat,
    validation: cell.validation,
  }
}
