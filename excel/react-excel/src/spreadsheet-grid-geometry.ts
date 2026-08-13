import {
  getAxisEndIndexAtOffset,
  getAxisOffsetForIndex,
  getAxisSpanSize,
  getAxisStartIndexAtOffset,
  getSurfaceSpanPx,
  normalizeViewportMetrics,
  planSnappedScrollPlacement,
  type AxisAnchorPlacement,
  type AxisScrollGeometry,
  type CellRange,
  type ViewportMetrics,
} from '@einfach/spreadsheet-ui-core'

/** The caller-owned logical offsets within the full spreadsheet surface. */
export interface SpreadsheetGridScrollOffset {
  readonly top: number
  readonly left: number
}

/** Sparse dimensions used to calculate one React grid's coordinate space. */
export interface SpreadsheetGridGeometryInput {
  readonly viewport: Omit<ViewportMetrics, 'scrollTop' | 'scrollLeft'>
  readonly scroll: SpreadsheetGridScrollOffset
  readonly rowHeights?: Record<string, number>
  readonly colWidths?: Record<string, number>
  readonly hiddenRows?: ReadonlySet<number>
  readonly hiddenCols?: ReadonlySet<number>
}

/** Rendered interval and anchored placement for one spreadsheet axis. */
export interface SpreadsheetGridAxisInterval {
  readonly startIndex: number
  readonly endIndex: number
  readonly startOffsetPx: number
  readonly endOffsetPx: number
  readonly totalPx: number
  readonly surfacePx: number
  readonly placement: AxisAnchorPlacement
}

/** Pure coordinate snapshot a React grid can render without owning UI state. */
export interface SpreadsheetGridGeometry {
  readonly window: CellRange
  readonly rows: SpreadsheetGridAxisInterval
  readonly cols: SpreadsheetGridAxisInterval
}

interface AxisIntervalInput {
  readonly count: number
  readonly fallbackSize: number
  readonly overrides?: Record<string, number>
  readonly hidden?: ReadonlySet<number>
  readonly logicalOffset: number
  readonly viewportSize: number
}

function finiteOffset(offset: number): number {
  return Number.isFinite(offset) ? offset : 0
}

function getAxisInterval(input: AxisIntervalInput): SpreadsheetGridAxisInterval {
  const totalPx = getAxisOffsetForIndex(
    input.count,
    input.count,
    input.fallbackSize,
    input.overrides,
    input.hidden,
  )
  const surfacePx = getSurfaceSpanPx(totalPx, input.viewportSize)
  const geometry: AxisScrollGeometry = {
    totalPx,
    viewportPx: input.viewportSize,
    surfacePx,
  }
  const placement = planSnappedScrollPlacement(
    finiteOffset(input.logicalOffset),
    geometry,
    (anchorPx) => {
      const index = getAxisStartIndexAtOffset(
        anchorPx,
        input.count,
        input.fallbackSize,
        input.overrides,
        input.hidden,
      )
      return getAxisOffsetForIndex(
        index,
        input.count,
        input.fallbackSize,
        input.overrides,
        input.hidden,
      )
    },
  )

  if (input.count === 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      startOffsetPx: 0,
      endOffsetPx: 0,
      totalPx,
      surfacePx,
      placement,
    }
  }

  const startIndex = getAxisStartIndexAtOffset(
    placement.anchorPx,
    input.count,
    input.fallbackSize,
    input.overrides,
    input.hidden,
  )
  const endIndex = getAxisEndIndexAtOffset(
    placement.anchorPx + surfacePx,
    input.count,
    input.fallbackSize,
    input.overrides,
    input.hidden,
  )
  const startOffsetPx = getAxisOffsetForIndex(
    startIndex,
    input.count,
    input.fallbackSize,
    input.overrides,
    input.hidden,
  )

  return {
    startIndex,
    endIndex,
    startOffsetPx,
    endOffsetPx:
      startOffsetPx +
      getAxisSpanSize(
        startIndex,
        endIndex,
        input.count,
        input.fallbackSize,
        input.overrides,
        input.hidden,
      ),
    totalPx,
    surfacePx,
    placement,
  }
}

/**
 * Maps controlled logical scroll offsets onto bounded grid coordinates.
 *
 * This deliberately has no DOM, React, projection, or product-state concerns.
 */
export function getSpreadsheetGridGeometry(
  input: SpreadsheetGridGeometryInput,
): SpreadsheetGridGeometry {
  const viewport = normalizeViewportMetrics({
    ...input.viewport,
    scrollTop: 0,
    scrollLeft: 0,
  })
  const rows = getAxisInterval({
    count: viewport.rowCount,
    fallbackSize: viewport.rowHeight,
    overrides: input.rowHeights,
    hidden: input.hiddenRows,
    logicalOffset: input.scroll.top,
    viewportSize: viewport.viewportHeight,
  })
  const cols = getAxisInterval({
    count: viewport.colCount,
    fallbackSize: viewport.colWidth,
    overrides: input.colWidths,
    hidden: input.hiddenCols,
    logicalOffset: input.scroll.left,
    viewportSize: viewport.viewportWidth,
  })

  const window =
    rows.endIndex < rows.startIndex || cols.endIndex < cols.startIndex
      ? { rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 }
      : {
          rowStart: rows.startIndex,
          rowEnd: rows.endIndex,
          colStart: cols.startIndex,
          colEnd: cols.endIndex,
        }

  return {
    window,
    rows,
    cols,
  }
}
