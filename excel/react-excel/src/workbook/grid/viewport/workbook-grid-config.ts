import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'

export const WORKBOOK_GRID_ROW_HEIGHT = 28
export const WORKBOOK_GRID_WINDOW_ROW_COUNT = 32

/** Creates the default React viewport metrics for one workbook sheet. */
export function workbookViewportMetrics(rowCount: number, colCount: number): ViewportMetrics {
  return {
    scrollTop: 0,
    scrollLeft: 0,
    viewportHeight: WORKBOOK_GRID_WINDOW_ROW_COUNT * WORKBOOK_GRID_ROW_HEIGHT,
    viewportWidth: colCount,
    rowHeight: WORKBOOK_GRID_ROW_HEIGHT,
    colWidth: 1,
    rowCount,
    colCount,
    overscanRows: 0,
    overscanCols: 0,
  }
}
