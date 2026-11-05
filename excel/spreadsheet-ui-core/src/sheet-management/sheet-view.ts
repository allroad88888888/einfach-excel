import { atom, type Atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { runSheetManagement } from './run-management'

export interface SheetViewInput {
  readonly sheetId: string
  readonly hideGridlines?: boolean
  readonly hideHeadings?: boolean
}

/** 网格线、行列标题是工作表视图选项：存于 Rust 并随文件保存，不进撤销历史。 */
export const setSheetViewAtom = atom(null, (get, set, input: SheetViewInput): Promise<boolean> =>
  runSheetManagement(get, set, {
    sheetId: input.sheetId,
    payload: {
      command: 'workbook.setSheetView',
      hideGridlines: input.hideGridlines,
      hideHeadings: input.hideHeadings,
    },
  }))
setSheetViewAtom.debugLabel = 'spreadsheet.sheetManagement.setView'

export const viewportShowGridlinesAtom: Atom<boolean> = atom((get) =>
  !get(activeWorkbookSheetAtom)?.hideGridlines)
viewportShowGridlinesAtom.debugLabel = 'spreadsheet.viewport.showGridlines'

export const viewportShowHeadingsAtom: Atom<boolean> = atom((get) =>
  !get(activeWorkbookSheetAtom)?.hideHeadings)
viewportShowHeadingsAtom.debugLabel = 'spreadsheet.viewport.showHeadings'

/** 切换活动表的一项视图选项；没有活动表时什么也不做。 */
function toggleActiveSheetView(key: 'hideGridlines' | 'hideHeadings') {
  return atom(
    (get) => !get(activeWorkbookSheetAtom)?.[key],
    (get, set): Promise<boolean> => {
      const sheet = get(activeWorkbookSheetAtom)
      if (!sheet) return Promise.resolve(false)
      return set(setSheetViewAtom, { sheetId: sheet.id, [key]: !sheet[key] })
    },
  )
}

export const toggleGridlinesAtom = toggleActiveSheetView('hideGridlines')
toggleGridlinesAtom.debugLabel = 'spreadsheet.viewport.toggleGridlines'

export const toggleHeadingsAtom = toggleActiveSheetView('hideHeadings')
toggleHeadingsAtom.debugLabel = 'spreadsheet.viewport.toggleHeadings'
