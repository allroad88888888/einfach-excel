import { atom } from '@einfach/core'
import type { WorkbookDocumentSheet } from './workbook-document'
import { selectCellAtom, setSelectionBoundsAtom } from '../selection'
import { setViewportScrollAtom } from '../viewport'
import { activateSheetTabAtom } from '../sheet-tabs/basic-commands'

/** 用户切表及历史移除当前表时共用的视图切换：画布、A1 选区、滚动位置一次更新。 */
export const activateWorkbookSheetAtom = atom(
  null,
  (_get, set, sheet: WorkbookDocumentSheet): void => {
    set(setSelectionBoundsAtom, { rowCount: sheet.rowCount, colCount: sheet.colCount })
    set(activateSheetTabAtom, { sheetId: sheet.id })
    set(selectCellAtom, { sheetId: sheet.id, coord: { row: 0, col: 0 }, extend: false })
    set(setViewportScrollAtom, { scrollTop: 0, scrollLeft: 0 })
  },
)
