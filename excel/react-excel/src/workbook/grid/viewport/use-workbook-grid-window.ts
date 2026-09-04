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
  const sheetId = activeSheet?.id
  const rowCount = activeSheet?.rowCount
  const colCount = activeSheet?.colCount

  useEffect(() => {
    if (sheetId === undefined || rowCount === undefined || colCount === undefined) return
    setViewportMetrics(workbookViewportMetrics(rowCount, colCount, sheetId))
  }, [colCount, rowCount, setViewportMetrics, sheetId])

  return window
}
