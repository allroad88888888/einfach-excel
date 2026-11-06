import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectDrawingAtom } from './state'

interface DrawingMenu {
  readonly sheetId: string
  readonly id: string
  readonly x: number
  readonly y: number
}
const menuAtom = atom<DrawingMenu | null>(null)
menuAtom.debugLabel = 'spreadsheet.drawings.menu.state'

/** 对象右键菜单的位置（视口坐标）；切换工作表即失效。 */
export const drawingMenuAtom = atom((get) => {
  const menu = get(menuAtom)
  return menu && menu.sheetId === get(activeWorkbookSheetAtom)?.id ? menu : null
})
drawingMenuAtom.debugLabel = 'spreadsheet.drawings.menu'

/** 右键即选中该对象并在指针处打开菜单；传 null 关闭。 */
export const openDrawingMenuAtom = atom(null,
  (get, set, input: { readonly id: string; readonly x: number; readonly y: number } | null) => {
    const sheet = get(activeWorkbookSheetAtom)
    if (!input || !sheet) {
      set(menuAtom, null)
      return
    }
    set(selectDrawingAtom, input.id)
    set(menuAtom, { sheetId: sheet.id, ...input })
  })
openDrawingMenuAtom.debugLabel = 'spreadsheet.drawings.menu.open'
