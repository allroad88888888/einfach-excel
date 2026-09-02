import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  setViewportMetricsAtom,
  visibleWindowAtom,
  type CellRange,
  type ViewportMetrics,
} from '@einfach/spreadsheet-ui-core'
import { useEffect } from 'react'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../../product/sales-orders/data/sheet'

export const GRID_ROW_HEIGHT = 28
export const GRID_WINDOW_ROW_COUNT = 32

const GRID_VIEWPORT_METRICS: ViewportMetrics = Object.freeze({
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: GRID_WINDOW_ROW_COUNT * GRID_ROW_HEIGHT,
  viewportWidth: SALES_ORDER_COLUMNS.length,
  rowHeight: GRID_ROW_HEIGHT,
  colWidth: 1,
  rowCount: SALES_ORDER_SHEET_ROW_COUNT,
  colCount: SALES_ORDER_COLUMNS.length,
  overscanRows: 0,
  overscanCols: 0,
})

/** Initializes product viewport metrics and reads the core-derived visible window. */
export function useGridWindow(): CellRange {
  const window = useAtomValue(visibleWindowAtom)
  const setViewportMetrics = useSetAtom(setViewportMetricsAtom)

  useEffect(() => {
    setViewportMetrics(GRID_VIEWPORT_METRICS)
  }, [setViewportMetrics])

  return window
}
