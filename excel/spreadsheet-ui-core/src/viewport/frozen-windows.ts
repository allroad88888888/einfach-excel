import { normalizeViewportMetrics } from './metrics'
import type { FrozenWindows, ViewportMetrics, VisibleWindow } from './types'
import { getVisibleWindow } from './visible-window'

const EMPTY_WINDOW: VisibleWindow = { rowStart: 0, rowEnd: -1, colStart: 0, colEnd: -1 }

/** Divides the current viewport into its frozen and scrollable quadrants. */
export function getFrozenWindows(
  metrics: ViewportMetrics,
  freeze: { rows: number; cols: number },
): FrozenWindows {
  const normalized = normalizeViewportMetrics(metrics)
  const frozenRows = Math.max(0, Math.min(Math.trunc(freeze.rows), normalized.rowCount))
  const frozenCols = Math.max(0, Math.min(Math.trunc(freeze.cols), normalized.colCount))
  const full = getVisibleWindow(metrics)
  const scrollRowStart = Math.max(frozenRows, full.rowStart)
  const scrollColStart = Math.max(frozenCols, full.colStart)

  const topLeft = createWindow(
    frozenRows > 0 && frozenCols > 0,
    0,
    frozenRows - 1,
    0,
    frozenCols - 1,
  )
  const topRight = createWindow(
    frozenRows > 0 && scrollColStart <= full.colEnd,
    0,
    frozenRows - 1,
    scrollColStart,
    full.colEnd,
  )
  const bottomLeft = createWindow(
    scrollRowStart <= full.rowEnd && frozenCols > 0,
    scrollRowStart,
    full.rowEnd,
    0,
    frozenCols - 1,
  )
  const bottomRight = createWindow(
    scrollRowStart <= full.rowEnd && scrollColStart <= full.colEnd,
    scrollRowStart,
    full.rowEnd,
    scrollColStart,
    full.colEnd,
  )

  return { topLeft, topRight, bottomLeft, bottomRight }
}

function createWindow(
  present: boolean,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
): VisibleWindow {
  return present ? { rowStart, rowEnd, colStart, colEnd } : { ...EMPTY_WINDOW }
}
