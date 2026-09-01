import type { CellRange } from '@einfach/spreadsheet-ui-core'
import { useCallback, useState } from 'react'
import { DEMO_COLUMNS } from './demo-data'

export const DEMO_GRID_ROW_HEIGHT = 28
export const DEMO_GRID_WINDOW_ROW_COUNT = 32

const INITIAL_WINDOW: CellRange = Object.freeze({
  rowStart: 0,
  rowEnd: DEMO_GRID_WINDOW_ROW_COUNT - 1,
  colStart: 0,
  colEnd: DEMO_COLUMNS.length - 1,
})

/** Owns the controlled row window consumed by the Rust projection hook. */
export function useDemoGridWindow(): {
  readonly window: CellRange
  readonly onWindowChange: (window: CellRange) => void
} {
  const [window, setWindow] = useState<CellRange>(INITIAL_WINDOW)
  const onWindowChange = useCallback((nextWindow: CellRange) => {
    setWindow(nextWindow)
  }, [])

  return { window, onWindowChange }
}
