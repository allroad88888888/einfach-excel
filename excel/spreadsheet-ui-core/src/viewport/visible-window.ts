import { atom } from '@einfach/core'
import type { CellCoord } from '../shared'
import {
  clampViewportIndex,
  normalizeViewportMetrics,
  viewportMetricsAtom,
} from './metrics'
import type { ViewportMetrics, VisibleWindow } from './types'
import { getAxisEndIndexAtOffset, getAxisStartIndexAtOffset } from './axis-geometry'
import { viewportSizeOverridesAtom } from './size-overrides'

/** Computes the rectangular projection needed to cover the current viewport. */
export function getVisibleWindow(
  metrics: ViewportMetrics,
  rowHeights?: Record<string, number>,
): VisibleWindow {
  const normalized = normalizeViewportMetrics(metrics, rowHeights)
  const { colCount, colWidth, rowCount, rowHeight } = normalized
  if (rowCount === 0 || colCount === 0) {
    return { rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 }
  }

  const rawRowStart = getAxisStartIndexAtOffset(
    normalized.scrollTop,
    rowCount,
    rowHeight,
    rowHeights,
  )
  const rawColStart = Math.floor(normalized.scrollLeft / colWidth)
  const colOffset = normalized.scrollLeft - rawColStart * colWidth
  // A clipped first item still consumes space, so the trailing edge may need one more item.
  const rawRowEnd = getAxisEndIndexAtOffset(
    normalized.scrollTop + normalized.viewportHeight,
    rowCount,
    rowHeight,
    rowHeights,
  )
  const visibleCols = Math.ceil((normalized.viewportWidth + colOffset) / colWidth)

  return {
    rowStart: clampViewportIndex(rawRowStart - normalized.overscanRows, rowCount),
    rowEnd: clampViewportIndex(
      rawRowEnd + normalized.overscanRows,
      rowCount,
    ),
    colStart: clampViewportIndex(rawColStart - normalized.overscanCols, colCount),
    colEnd: clampViewportIndex(
      rawColStart + Math.max(1, visibleCols) + normalized.overscanCols - 1,
      colCount,
    ),
  }
}

/** Returns the count of indices in [start, end] that are not hidden. */
export function countVisibleIndices(start: number, end: number, hidden: number[]): number {
  if (start > end) return 0
  let hiddenCount = 0
  for (const index of hidden) {
    if (index < start) continue
    if (index > end) break
    hiddenCount += 1
  }
  return end - start + 1 - hiddenCount
}

/** Inflates a visible window so hidden indices do not reduce its painted span. */
export function getVisibleWindowWithHidden(
  metrics: ViewportMetrics,
  hidden: { rows: number[]; cols: number[] },
): VisibleWindow {
  const base = getVisibleWindow(metrics)
  const normalized = normalizeViewportMetrics(metrics)
  if (normalized.rowCount === 0 || normalized.colCount === 0) return base

  const targetRows = base.rowEnd - base.rowStart + 1
  const targetCols = base.colEnd - base.colStart + 1
  let rowEnd = base.rowStart - 1
  let seenRows = 0
  for (let row = base.rowStart; row < normalized.rowCount && seenRows < targetRows; row += 1) {
    rowEnd = row
    if (!hidden.rows.includes(row)) seenRows += 1
  }
  if (rowEnd < base.rowStart) rowEnd = Math.min(base.rowStart, normalized.rowCount - 1)

  let colEnd = base.colStart - 1
  let seenCols = 0
  for (let col = base.colStart; col < normalized.colCount && seenCols < targetCols; col += 1) {
    colEnd = col
    if (!hidden.cols.includes(col)) seenCols += 1
  }
  if (colEnd < base.colStart) colEnd = Math.min(base.colStart, normalized.colCount - 1)
  return { rowStart: base.rowStart, rowEnd, colStart: base.colStart, colEnd }
}

export function isCellInVisibleWindow(coord: CellCoord, visibleWindow: VisibleWindow): boolean {
  return (
    visibleWindow.rowStart <= visibleWindow.rowEnd &&
    visibleWindow.colStart <= visibleWindow.colEnd &&
    coord.row >= visibleWindow.rowStart &&
    coord.row <= visibleWindow.rowEnd &&
    coord.col >= visibleWindow.colStart &&
    coord.col <= visibleWindow.colEnd
  )
}

export const visibleWindowAtom = atom((get): VisibleWindow => {
  const metrics = get(viewportMetricsAtom)
  const sizes = get(viewportSizeOverridesAtom)
  const rowHeights = metrics.sheetId
    ? sizes.rowHeightsBySheet[metrics.sheetId]
    : undefined
  return getVisibleWindow(metrics, rowHeights)
})
visibleWindowAtom.debugLabel = 'spreadsheet.viewport.visibleWindow'
