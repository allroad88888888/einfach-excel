import { getVisibleWindow } from './visible-window'
import type { ViewportMetrics } from './types'

/** Keep two screens above and three below for coalesced wheel input; columns use four screens. */
export function getBufferedProjectionWindow(metrics: ViewportMetrics,
  rowHeights?: Record<string, number>, colWidths?: Record<string, number>) {
  const height = Math.max(metrics.rowHeight, metrics.viewportHeight)
  const width = Math.max(metrics.colWidth, metrics.viewportWidth)
  return getVisibleWindow({
    ...metrics,
    scrollTop: Math.max(0, (Math.floor(metrics.scrollTop / height) - 2) * height),
    scrollLeft: Math.max(0, (Math.floor(metrics.scrollLeft / width) - 1) * width),
    viewportHeight: height * 6,
    viewportWidth: width * 4,
    overscanRows: 0,
    overscanCols: 0,
  }, rowHeights, colWidths)
}
