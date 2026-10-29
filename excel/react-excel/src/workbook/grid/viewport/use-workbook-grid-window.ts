import { useAtomValue, useSetAtom } from '@einfach/react'
import {
  activeWorkbookSheetAtom,
  initializeViewportMetricsAtom,
  getBufferedProjectionWindow,
  viewportMetricsAtom,
  viewportGeometrySizesAtom,
  type CellRange,
} from '@einfach-excel/spreadsheet-ui-core'
import { useEffect } from 'react'
import { workbookViewportMetrics } from './workbook-grid-config'

/** Initializes viewport metrics from the active workbook sheet. */
export function useWorkbookGridWindow(): CellRange {
  const activeSheet = useAtomValue(activeWorkbookSheetAtom)
  const metrics = useAtomValue(viewportMetricsAtom)
  const sizes = useAtomValue(viewportGeometrySizesAtom)
  const setViewportMetrics = useSetAtom(initializeViewportMetricsAtom)
  const sheetId = activeSheet?.id
  const rowCount = activeSheet?.rowCount
  const colCount = activeSheet?.colCount

  useEffect(() => {
    if (sheetId === undefined || rowCount === undefined || colCount === undefined) return
    setViewportMetrics(workbookViewportMetrics(rowCount, colCount, sheetId))
  }, [colCount, rowCount, setViewportMetrics, sheetId])

  return getBufferedProjectionWindow(metrics,
    sheetId ? sizes.rowHeightsBySheet[sheetId] : undefined,
    sheetId ? sizes.colWidthsBySheet[sheetId] : undefined)
}
