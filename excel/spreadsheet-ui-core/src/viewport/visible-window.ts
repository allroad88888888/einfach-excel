import { atom } from '@einfach/core'
import type { CellCoord } from '../shared'
import { clampViewportIndex, normalizeViewportMetrics, viewportMetricsAtom } from './metrics'
import type { ViewportMetrics, VisibleWindow } from './types'
import { getAxisEndIndexAtOffset, getAxisStartIndexAtOffset } from './axis-geometry'
import { viewportGeometrySizesAtom } from './geometry-sizes'

/** Computes the rectangular projection needed to cover the current viewport. */
export function getVisibleWindow(
  metrics: ViewportMetrics,
  rowHeights?: Record<string, number>,
  colWidths?: Record<string, number>,
): VisibleWindow {
  const normalized = normalizeViewportMetrics(metrics, rowHeights, colWidths)
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
  const rawColStart = getAxisStartIndexAtOffset(
    normalized.scrollLeft,
    colCount,
    colWidth,
    colWidths,
  )
  // A clipped first item still consumes space, so the trailing edge may need one more item.
  const rawRowEnd = getAxisEndIndexAtOffset(
    normalized.scrollTop + normalized.viewportHeight,
    rowCount,
    rowHeight,
    rowHeights,
  )
  const rawColEnd = getAxisEndIndexAtOffset(
    normalized.scrollLeft + normalized.viewportWidth,
    colCount,
    colWidth,
    colWidths,
  )

  return {
    rowStart: clampViewportIndex(rawRowStart - normalized.overscanRows, rowCount),
    rowEnd: clampViewportIndex(rawRowEnd + normalized.overscanRows, rowCount),
    colStart: clampViewportIndex(rawColStart - normalized.overscanCols, colCount),
    colEnd: clampViewportIndex(
      Math.max(rawColStart, rawColEnd) + normalized.overscanCols,
      colCount,
    ),
  }
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
  const sizes = get(viewportGeometrySizesAtom)
  const rowHeights = metrics.sheetId ? sizes.rowHeightsBySheet[metrics.sheetId] : undefined
  return getVisibleWindow(
    metrics,
    rowHeights,
    metrics.sheetId ? sizes.colWidthsBySheet[metrics.sheetId] : undefined,
  )
})
visibleWindowAtom.debugLabel = 'spreadsheet.viewport.visibleWindow'
