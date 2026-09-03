import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  setViewportMetricsAtom,
  visibleWindowAtom,
  type CellRange,
} from '@einfach/spreadsheet-ui-core'
import { useEffect } from 'react'
import { workbookViewportMetrics } from './workbook-grid-config'

/** Initializes viewport metrics from the active workbook sheet. */
export function useWorkbookGridWindow(): CellRange {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const window = useAtomValue(visibleWindowAtom)
  const setViewportMetrics = useSetAtom(setViewportMetricsAtom)

  useEffect(() => {
    if (activeSheet === null) return
    setViewportMetrics(workbookViewportMetrics(activeSheet.rowCount, activeSheet.colCount))
  }, [activeSheet, setViewportMetrics])

  return window
}
