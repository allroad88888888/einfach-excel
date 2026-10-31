import { atom } from '@einfach/core'
import { workbookDocumentAtom } from '../runtime/workbook-document'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { runSheetManagement } from './run-management'
import { CLOSED, sheetManagementUiAtom } from './ui-state'
import { visibleSheets } from './visible-sheets'

const LAST_VISIBLE = 'Keep at least one worksheet visible.'
const COLOR = /^#[0-9a-fA-F]{6}$/

/** 复制：Rust 在源表之后创建 `Name (2)` 并成为活动表。 */
export const duplicateSheetAtom = atom(null, (get, set, sheetId: string): Promise<boolean> => {
  set(sheetManagementUiAtom, CLOSED)
  return runSheetManagement(get, set, {
    sheetId,
    payload: { command: 'workbook.duplicateSheet' },
  })
})

/** 隐藏：最后一张可见表在界面层就拒绝，Rust 再做最终校验。 */
export const hideSheetAtom = atom(null, async (get, set, sheetId: string): Promise<boolean> => {
  set(sheetManagementUiAtom, CLOSED)
  const sheets = get(workbookDocumentAtom).sheets
  if (visibleSheets(sheets).length <= 1) {
    set(sheetTabsAtom, { ...get(sheetTabsAtom), contextMenu: null, error: LAST_VISIBLE })
    return false
  }
  return runSheetManagement(get, set, {
    sheetId,
    payload: { command: 'workbook.setSheetHidden', hidden: true },
  })
})

/** 取消隐藏：对话框选中的表恢复为可见，并关闭对话框。 */
export const unhideSheetAtom = atom(null, async (get, set, sheetId: string): Promise<boolean> => {
  const done = await runSheetManagement(get, set, {
    sheetId,
    payload: { command: 'workbook.setSheetHidden', hidden: false },
  })
  if (done) set(sheetManagementUiAtom, CLOSED)
  return done
})

export const setSheetTabColorAtom = atom(
  null,
  async (get, set, input: { sheetId: string; color: string | null }): Promise<boolean> => {
    set(sheetManagementUiAtom, CLOSED)
    if (input.color !== null && !COLOR.test(input.color)) return false
    return runSheetManagement(get, set, {
      sheetId: input.sheetId,
      payload: { command: 'workbook.setSheetTabColor', color: input.color },
    })
  },
)

duplicateSheetAtom.debugLabel = 'spreadsheet.sheetManagement.duplicate'
hideSheetAtom.debugLabel = 'spreadsheet.sheetManagement.hide'
unhideSheetAtom.debugLabel = 'spreadsheet.sheetManagement.unhide'
setSheetTabColorAtom.debugLabel = 'spreadsheet.sheetManagement.setTabColor'
