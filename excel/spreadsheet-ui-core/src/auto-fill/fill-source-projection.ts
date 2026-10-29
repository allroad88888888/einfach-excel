import type { DisplayCell, RangeProjectionResult } from '../backend/types'
import type { CellRange } from '../shared'
import type { AutoFillIntent } from './command-contract'
import { cellKey, sameRange } from './fill-range-geometry'

export function isExactProjection(
  projection: RangeProjectionResult,
  sheetId: string,
  range: Readonly<CellRange>,
): boolean {
  return (
    projection.kind === 'range' &&
    projection.sheetId === sheetId &&
    sameRange(projection.range, range) &&
    projection.truncated !== true
  )
}

export function orderedSeriesCells(
  projection: RangeProjectionResult,
  sourceRange: Readonly<CellRange>,
  direction: AutoFillIntent['direction'],
): DisplayCell[] | null {
  const expected =
    direction === 'down' || direction === 'up'
      ? sourceRange.rowEnd - sourceRange.rowStart + 1
      : sourceRange.colEnd - sourceRange.colStart + 1
  if (projection.cells.length !== expected) return null

  const cells = new Map<string, DisplayCell>()
  for (const cell of projection.cells) {
    if (
      !Number.isSafeInteger(cell.row) ||
      !Number.isSafeInteger(cell.col) ||
      cell.row < sourceRange.rowStart ||
      cell.row > sourceRange.rowEnd ||
      cell.col < sourceRange.colStart ||
      cell.col > sourceRange.colEnd
    ) {
      return null
    }
    const key = cellKey(cell.row, cell.col)
    if (cells.has(key)) return null
    cells.set(key, cell)
  }

  const ordered: DisplayCell[] = []
  if (direction === 'down' || direction === 'up') {
    for (let row = sourceRange.rowStart; row <= sourceRange.rowEnd; row += 1) {
      const cell = cells.get(cellKey(row, sourceRange.colStart))
      if (!cell) return null
      ordered.push(cell)
    }
  } else {
    for (let col = sourceRange.colStart; col <= sourceRange.colEnd; col += 1) {
      const cell = cells.get(cellKey(sourceRange.rowStart, col))
      if (!cell) return null
      ordered.push(cell)
    }
  }
  return ordered
}

export function validatedSparseSourceCells(
  projection: RangeProjectionResult,
  sourceRange: Readonly<CellRange>,
): Map<string, DisplayCell> | null {
  const cells = new Map<string, DisplayCell>()
  for (const cell of projection.cells) {
    if (
      !Number.isSafeInteger(cell.row) ||
      !Number.isSafeInteger(cell.col) ||
      cell.row < sourceRange.rowStart ||
      cell.row > sourceRange.rowEnd ||
      cell.col < sourceRange.colStart ||
      cell.col > sourceRange.colEnd
    ) {
      return null
    }
    const key = cellKey(cell.row, cell.col)
    if (cells.has(key)) return null
    cells.set(key, cell)
  }
  return cells
}
