import { atom, type Atom } from '@einfach/core'
import { workbookDocumentAtom } from '../runtime/workbook-document'
import { dispatchSheetTabIntentAtom } from '../sheet-tabs/basic-commands'
import { sheetTabsAtom } from '../sheet-tabs/state'
import { hiddenSheets } from './visible-sheets'

export interface SheetManagementUiState {
  /** 右键菜单里「标签颜色」子菜单是否展开。 */
  readonly colorMenuOpen: boolean
  /** 「取消隐藏」对话框是否打开，及其中选中的表。 */
  readonly unhideOpen: boolean
  readonly unhideSelection: string | null
}

export const CLOSED: SheetManagementUiState = {
  colorMenuOpen: false,
  unhideOpen: false,
  unhideSelection: null,
}
const backing = atom<SheetManagementUiState>(CLOSED)
backing.debugLabel = 'spreadsheet.sheetManagement.uiBacking'

export const sheetManagementUiAtom = atom(
  (get) => get(backing),
  (_get, set, next: SheetManagementUiState) => set(backing, next),
)
sheetManagementUiAtom.debugLabel = 'spreadsheet.sheetManagement.ui'

/** 当前处于隐藏状态的表，取消隐藏对话框的列表数据。 */
export const hiddenSheetListAtom: Atom<readonly { id: string; name: string }[]> = atom((get) =>
  hiddenSheets(get(workbookDocumentAtom).sheets).map(({ id, name }) => ({ id, name })),
)
hiddenSheetListAtom.debugLabel = 'spreadsheet.sheetManagement.hiddenList'

/** 右键标签：打开该表的上下文菜单。 */
export const openSheetTabMenuAtom = atom(
  null,
  (get, set, input: { sheetId: string; x: number; y: number }): boolean => {
    const state = get(sheetTabsAtom)
    if (state.mutation || !get(workbookDocumentAtom).sheets.some((s) => s.id === input.sheetId))
      return false
    set(backing, CLOSED)
    set(dispatchSheetTabIntentAtom, {
      type: 'sheet-tab.context-menu.open',
      sheetId: input.sheetId,
      x: input.x,
      y: input.y,
      source: 'pointer',
    })
    return true
  },
)
openSheetTabMenuAtom.debugLabel = 'spreadsheet.sheetManagement.openMenu'

export const closeSheetTabMenuAtom = atom(null, (get, set): void => {
  set(backing, CLOSED)
  if (get(sheetTabsAtom).contextMenu)
    set(dispatchSheetTabIntentAtom, { type: 'sheet-tab.context-menu.close', reason: 'dismissed' })
})
closeSheetTabMenuAtom.debugLabel = 'spreadsheet.sheetManagement.closeMenu'

export const toggleTabColorMenuAtom = atom(null, (get, set): void => {
  const state = get(backing)
  set(backing, { ...state, colorMenuOpen: !state.colorMenuOpen })
})
toggleTabColorMenuAtom.debugLabel = 'spreadsheet.sheetManagement.toggleColorMenu'

/** 「取消隐藏…」：关闭菜单，列出隐藏表并默认选中第一张。 */
export const openUnhideDialogAtom = atom(null, (get, set): boolean => {
  const hidden = get(hiddenSheetListAtom)
  if (hidden.length === 0) return false
  set(dispatchSheetTabIntentAtom, { type: 'sheet-tab.context-menu.close', reason: 'committed' })
  set(backing, { colorMenuOpen: false, unhideOpen: true, unhideSelection: hidden[0]!.id })
  return true
})
openUnhideDialogAtom.debugLabel = 'spreadsheet.sheetManagement.openUnhide'

export const chooseUnhideSheetAtom = atom(null, (get, set, sheetId: string): void => {
  if (get(hiddenSheetListAtom).some((sheet) => sheet.id === sheetId))
    set(backing, { ...get(backing), unhideSelection: sheetId })
})
chooseUnhideSheetAtom.debugLabel = 'spreadsheet.sheetManagement.chooseUnhide'

export const closeUnhideDialogAtom = atom(null, (_get, set): void => {
  set(backing, CLOSED)
})
closeUnhideDialogAtom.debugLabel = 'spreadsheet.sheetManagement.closeUnhide'
