import { atom } from '@einfach/core'
import { runWorkbookSheetCommandAtom } from '../sheet-tabs/workbook-command'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { adjacentVisibleSheet } from './visible-sheets'

/** 上一张/下一张标签与 Ctrl+PageUp/PageDown：隐藏的表被跳过，到端点不循环。 */
export const switchAdjacentSheetAtom = atom(
  null,
  async (get, set, direction: 'previous' | 'next'): Promise<boolean> => {
    const target = adjacentVisibleSheet(
      get(workbookDocumentAtom).sheets,
      get(activeWorkbookSheetAtom)?.id ?? null,
      direction,
    )
    if (!target) return false
    return set(runWorkbookSheetCommandAtom, { operation: 'switch', sheetId: target.id })
  },
)
switchAdjacentSheetAtom.debugLabel = 'spreadsheet.sheetManagement.switchAdjacent'
