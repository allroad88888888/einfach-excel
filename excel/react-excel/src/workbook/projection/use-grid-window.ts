import type { CellRange } from '@einfach/spreadsheet-ui-core'
import { useCallback, useState } from 'react'
import { SALES_ORDER_COLUMNS } from '../data/sales-orders'

export const GRID_ROW_HEIGHT = 28
export const GRID_WINDOW_ROW_COUNT = 32

const INITIAL_WINDOW: CellRange = Object.freeze({
  rowStart: 0,
  rowEnd: GRID_WINDOW_ROW_COUNT - 1,
  colStart: 0,
  colEnd: SALES_ORDER_COLUMNS.length - 1,
})

/** Owns the controlled row window consumed by the Rust projection hook. */
export function useGridWindow(): {
  readonly window: CellRange
  readonly onWindowChange: (window: CellRange) => void
} {
  const [window, setWindow] = useState<CellRange>(INITIAL_WINDOW)
  const onWindowChange = useCallback((nextWindow: CellRange) => {
    setWindow(nextWindow)
  }, [])

  return { window, onWindowChange }
}
