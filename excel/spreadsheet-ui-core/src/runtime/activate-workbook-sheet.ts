import { atom } from '@einfach/core'
import type { WorkbookDocumentSheet } from './workbook-document'
import { selectCellAtom, setSelectionBoundsAtom } from '../selection'
import { scrollToCellAtom, setViewportMetricsAtom, viewportMetricsAtom } from '../viewport/metrics'
import { activateSheetTabAtom } from '../sheet-tabs/basic-commands'
import type { CellCoord } from '../shared'

/** 用户切表及历史移除当前表时共用的视图切换：画布、A1 选区、滚动位置一次更新。 */
export const activateWorkbookSheetAtom = atom(
  null,
  (get, set, sheet: WorkbookDocumentSheet, coord?: CellCoord): void => {
    set(setSelectionBoundsAtom, { rowCount: sheet.rowCount, colCount: sheet.colCount })
    set(activateSheetTabAtom, { sheetId: sheet.id })
    set(selectCellAtom, { sheetId: sheet.id, coord: coord ?? { row: 0, col: 0 }, extend: false })
    // 表与画布尺寸同步切换，返回离屏编辑源也无需等 React 再补一轮旧尺寸。
    set(setViewportMetricsAtom, {
      ...get(viewportMetricsAtom), sheetId: sheet.id,
      rowCount: sheet.rowCount, colCount: sheet.colCount, scrollTop: 0, scrollLeft: 0,
    })
    if (coord) set(scrollToCellAtom, { coord })
  },
)
