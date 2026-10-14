import { getVisibleWindow } from './visible-window'
import type { ViewportMetrics } from './types'

/** Keep one screen behind and two ahead; fetch only when a screen-sized bucket changes. */
export function getBufferedProjectionWindow(metrics: ViewportMetrics,
  rowHeights?: Record<string, number>, colWidths?: Record<string, number>) {
  const height = Math.max(metrics.rowHeight, metrics.viewportHeight)
  const width = Math.max(metrics.colWidth, metrics.viewportWidth)
  return getVisibleWindow({
    ...metrics,
    scrollTop: Math.max(0, (Math.floor(metrics.scrollTop / height) - 1) * height),
    scrollLeft: Math.max(0, (Math.floor(metrics.scrollLeft / width) - 1) * width),
    viewportHeight: height * 4,
    viewportWidth: width * 4,
    overscanRows: 0,
    overscanCols: 0,
  }, rowHeights, colWidths)
}
