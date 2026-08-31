// 一句话：合并区注册表的读取与向投影结果的注入。

import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'
import { isCoordInsideRange, rangesIntersect } from '@einfach/spreadsheet-ui-core'
import { upsertBlankCell } from './cell-map'
import type { StaticBackendState } from './state'

export function extractMergeRanges(
  cells: readonly DisplayCell[],
  sheetId: string,
): Map<string, CellRange[]> {
  const ranges: CellRange[] = []
  for (const cell of cells) {
    if (!cell.mergedSpan) continue
    const rows = Math.max(1, Math.trunc(cell.mergedSpan.rows))
    const cols = Math.max(1, Math.trunc(cell.mergedSpan.cols))
    if (rows === 1 && cols === 1) continue
    ranges.push({
      rowStart: cell.row,
      rowEnd: cell.row + rows - 1,
      colStart: cell.col,
      colEnd: cell.col + cols - 1,
    })
  }

  return ranges.length > 0 ? new Map([[sheetId, ranges]]) : new Map()
}

export function getMergeRanges(state: StaticBackendState, sheetId: string): CellRange[] {
  let ranges = state.mergeRangesBySheetId.get(sheetId)
  if (!ranges) {
    ranges = []
    state.mergeRangesBySheetId.set(sheetId, ranges)
  }
  return ranges
}

export function applyMergeMetadata(
  cells: Map<string, DisplayCell>,
  projectionRange: CellRange,
  mergeRanges: readonly CellRange[],
) {
  for (const mergeRange of mergeRanges) {
    if (!rangesIntersect(mergeRange, projectionRange)) continue

    if (isCoordInsideRange(mergeRange.rowStart, mergeRange.colStart, projectionRange)) {
      const anchor = upsertBlankCell(cells, mergeRange.rowStart, mergeRange.colStart)
      delete anchor.mergeAnchor
      anchor.mergedSpan = {
        rows: mergeRange.rowEnd - mergeRange.rowStart + 1,
        cols: mergeRange.colEnd - mergeRange.colStart + 1,
      }
    }

    const rowStart = Math.max(mergeRange.rowStart, projectionRange.rowStart)
    const rowEnd = Math.min(mergeRange.rowEnd, projectionRange.rowEnd)
    const colStart = Math.max(mergeRange.colStart, projectionRange.colStart)
    const colEnd = Math.min(mergeRange.colEnd, projectionRange.colEnd)

    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        if (row === mergeRange.rowStart && col === mergeRange.colStart) continue
        const covered = upsertBlankCell(cells, row, col)
        delete covered.mergedSpan
        covered.mergeAnchor = { row: mergeRange.rowStart, col: mergeRange.colStart }
      }
    }
  }
}
