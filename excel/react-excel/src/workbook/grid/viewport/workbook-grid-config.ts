import type { ViewportMetrics } from '@einfach/spreadsheet-ui-core'

export const WORKBOOK_GRID_ROW_HEIGHT = 28
export const WORKBOOK_GRID_WINDOW_ROW_COUNT = 32
export const WORKBOOK_GRID_ROW_HEADER_WIDTH = 46
export const WORKBOOK_GRID_COLUMN_WIDTH = 120
export const WORKBOOK_GRID_WINDOW_COLUMN_COUNT = 8

/** Creates the default React viewport metrics for one workbook sheet. */
export function workbookViewportMetrics(
  rowCount: number,
  colCount: number,
  sheetId?: string,
): ViewportMetrics {
  return {
    ...(sheetId === undefined ? {} : { sheetId }),
    scrollTop: 0,
    scrollLeft: 0,
    viewportHeight: WORKBOOK_GRID_WINDOW_ROW_COUNT * WORKBOOK_GRID_ROW_HEIGHT,
    viewportWidth:
      Math.min(colCount, WORKBOOK_GRID_WINDOW_COLUMN_COUNT) * WORKBOOK_GRID_COLUMN_WIDTH,
    rowHeight: WORKBOOK_GRID_ROW_HEIGHT,
    colWidth: WORKBOOK_GRID_COLUMN_WIDTH,
    rowCount,
    colCount,
    overscanRows: 0,
    overscanCols: 0,
  }
}
