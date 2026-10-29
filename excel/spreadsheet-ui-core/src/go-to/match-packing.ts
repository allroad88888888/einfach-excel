import type { CellRange } from '../shared'
import type { CellSelection, RangeSelection, SelectionState } from '../selection'
import type { GoToScanResult } from './types'
import { GO_TO_REGION_CAP } from './types'

export function keyOf(row: number, col: number): string {
  return `${row}:${col}`
}

export function toCellSelection(sheetId: string, row: number, col: number): CellSelection {
  return {
    kind: 'cell',
    sheetId,
    anchor: { row, col },
    focus: { row, col },
  }
}

function toRangeSelection(sheetId: string, rect: CellRange): RangeSelection {
  return {
    kind: 'range',
    sheetId,
    anchor: { row: rect.rowStart, col: rect.colStart },
    focus: { row: rect.rowEnd, col: rect.colEnd },
  }
}

/**
 * Pack a list of matched coords into selection regions, coalescing
 * horizontally-contiguous runs on each row into a single range. The cap is
 * applied AFTER coalescing so a row-wide blank scan collapses to one region
 * per row, well below the 500-region ceiling.
 */
export function packMatches(
  sheetId: string,
  matches: { row: number; col: number }[],
): GoToScanResult {
  const totalMatchCount = matches.length
  if (totalMatchCount === 0) {
    return { regions: [], truncated: false, totalMatchCount: 0 }
  }
  // Coalesce: bucket by row, sort each bucket's cols ascending, walk for
  // contiguous runs. Result is row-major, col-ascending.
  const byRow = new Map<number, number[]>()
  for (const m of matches) {
    const arr = byRow.get(m.row)
    if (arr) arr.push(m.col)
    else byRow.set(m.row, [m.col])
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b)
  const regions: SelectionState[] = []
  let truncated = false
  for (const r of rows) {
    const cols = byRow.get(r)!
    cols.sort((a, b) => a - b)
    let runStart = cols[0]
    let runEnd = cols[0]
    for (let i = 1; i < cols.length; i += 1) {
      const c = cols[i]
      if (c === runEnd + 1) {
        runEnd = c
      } else {
        if (!pushRegion(regions, sheetId, r, runStart, runEnd)) {
          truncated = true
          break
        }
        runStart = c
        runEnd = c
      }
    }
    if (truncated) break
    if (!pushRegion(regions, sheetId, r, runStart, runEnd)) {
      truncated = true
      break
    }
  }
  return { regions, truncated, totalMatchCount }
}

function pushRegion(
  regions: SelectionState[],
  sheetId: string,
  row: number,
  colStart: number,
  colEnd: number,
): boolean {
  if (regions.length >= GO_TO_REGION_CAP) return false
  if (colStart === colEnd) {
    regions.push(toCellSelection(sheetId, row, colStart))
  } else {
    regions.push(
      toRangeSelection(sheetId, {
        rowStart: row,
        rowEnd: row,
        colStart,
        colEnd,
      }),
    )
  }
  return true
}
