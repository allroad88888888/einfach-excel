import { parseA1Range } from '../name-box/address'
import type { CellCoord, CellRange } from '../shared'
import type { SpreadsheetTableDescriptor } from './types'

export function normalizeRange(range: CellRange): CellRange {
  return {
    rowStart: Math.min(range.rowStart, range.rowEnd),
    rowEnd: Math.max(range.rowStart, range.rowEnd),
    colStart: Math.min(range.colStart, range.colEnd),
    colEnd: Math.max(range.colStart, range.colEnd),
  }
}

/**
 * MVP create-table gate (design §3/§4.1): the selection must be a
 * well-formed rectangle with a header row AND at least one data row
 * (`rowEnd > rowStart`), so `#Data` structured references resolve to a
 * non-empty region. A single cell / single row is rejected — the engine
 * models no auto-expand in this slice.
 */
export function isValidCreateTableRange(range: CellRange): boolean {
  return (
    Number.isSafeInteger(range.rowStart) &&
    Number.isSafeInteger(range.rowEnd) &&
    Number.isSafeInteger(range.colStart) &&
    Number.isSafeInteger(range.colEnd) &&
    range.rowStart >= 0 &&
    range.colStart >= 0 &&
    range.colEnd >= range.colStart &&
    range.rowEnd >= range.rowStart + 1
  )
}

/**
 * The first table in `tables` whose A1 range contains `coord` (unparseable
 * ranges are skipped). MVP tables never overlap, so the first hit is the
 * unique owner. Framework-neutral selection→table resolution reused by the
 * totals-row UI entry and its unit tests.
 */
export function findTableForCell(
  tables: readonly SpreadsheetTableDescriptor[],
  coord: CellCoord,
): SpreadsheetTableDescriptor | undefined {
  for (const table of tables) {
    const range = parseA1Range(table.range)
    if (range === null) continue
    if (
      coord.row >= range.rowStart &&
      coord.row <= range.rowEnd &&
      coord.col >= range.colStart &&
      coord.col <= range.colEnd
    ) {
      return table
    }
  }
  return undefined
}
