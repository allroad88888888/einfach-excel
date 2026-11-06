import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { viewportGeometrySizesAtom } from '../viewport/geometry-sizes'
import { viewportMetricsAtom } from '../viewport/metrics'
import { anchorForContentRect, draggedDrawingRect, drawingContentRect,
  type DrawingHandle, type DrawingRect } from './geometry'
import { changeSheetDrawingAtom, selectDrawingAtom, sheetDrawingsAtom } from './state'

interface DrawingDrag {
  readonly sheetId: string
  readonly id: string
  readonly handle: DrawingHandle
  readonly start: DrawingRect
  readonly current: DrawingRect
}
const dragAtom = atom<DrawingDrag | null>(null)
dragAtom.debugLabel = 'spreadsheet.drawings.drag.state'

/** 拖动中的预览矩形（内容坐标）；Rust 目录在松手前不变。 */
export const drawingDragAtom = atom((get) => get(dragAtom))
drawingDragAtom.debugLabel = 'spreadsheet.drawings.drag'

export type DrawingDragAction =
  | { readonly type: 'start'; readonly id: string; readonly handle: DrawingHandle }
  | { readonly type: 'move'; readonly dx: number; readonly dy: number }
  | { readonly type: 'finish' }
  | { readonly type: 'cancel' }

/** 指针期间只改预览；松手换算成锚点，只提交一次 Rust 命令（一条撤销记录）。 */
export const dragDrawingAtom = atom(null,
  async (get, set, action: DrawingDragAction): Promise<boolean> => {
    const drag = get(dragAtom)
    if (action.type === 'start') {
      const sheet = get(activeWorkbookSheetAtom)
      const drawing = get(sheetDrawingsAtom).find((entry) => entry.id === action.id)
      if (!sheet || !drawing) return false
      // 按下即选中；不移动松手只留下选中。
      set(selectDrawingAtom, drawing.id)
      const start = drawingContentRect(drawing.anchor, get(viewportMetricsAtom),
        get(viewportGeometrySizesAtom))
      set(dragAtom, { sheetId: sheet.id, id: drawing.id, handle: action.handle, start,
        current: start })
      return true
    }
    if (!drag) return false
    if (action.type === 'move') {
      if (!Number.isFinite(action.dx) || !Number.isFinite(action.dy)) return false
      set(dragAtom, { ...drag,
        current: draggedDrawingRect(drag.start, drag.handle, action.dx, action.dy) })
      return true
    }
    set(dragAtom, null)
    if (action.type === 'cancel') return false
    const drawing = get(sheetDrawingsAtom).find((entry) => entry.id === drag.id)
    if (!drawing || get(activeWorkbookSheetAtom)?.id !== drag.sheetId) return false
    const anchor = anchorForContentRect(drag.current, get(viewportMetricsAtom),
      get(viewportGeometrySizesAtom))
    const same = (Object.keys(anchor) as (keyof typeof anchor)[])
      .every((key) => anchor[key] === drawing.anchor[key])
    if (same) return false
    return set(changeSheetDrawingAtom, { type: 'set', drawing: { ...drawing, anchor } })
  })
dragDrawingAtom.debugLabel = 'spreadsheet.drawings.drag.run'
