import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import { MAX_DRAWING_SIZE_PX, type SheetDrawing } from './types'
import { changeSheetDrawingAtom, selectDrawingAtom, sheetDrawingsAtom } from './state'

interface DrawingClipboard {
  readonly connection: RustWorkbookConnection
  readonly sheetId: string
  readonly drawing: SheetDrawing
}
const clipboardAtom = atom<DrawingClipboard | null>(null)
clipboardAtom.debugLabel = 'spreadsheet.drawings.clipboard.state'

/** 对象剪贴板只在本工作簿内有效；数据引用是同表区域，所以只能粘贴回来源工作表。 */
export const drawingClipboardAtom = atom((get) => {
  const clipboard = get(clipboardAtom)
  const sheet = get(activeWorkbookSheetAtom)
  return {
    available: Boolean(clipboard && clipboard.connection === get(rustWorkbookConnectionAtom)),
    pasteHere: Boolean(clipboard && clipboard.sheetId === sheet?.id &&
      clipboard.connection === get(rustWorkbookConnectionAtom)),
  }
})
drawingClipboardAtom.debugLabel = 'spreadsheet.drawings.clipboard'

/** 复制或剪切：剪切 = 复制 + 删除（一条撤销记录）。 */
export const copyDrawingAtom = atom(null,
  async (get, set, input: { readonly id: string; readonly cut?: boolean }): Promise<boolean> => {
    const connection = get(rustWorkbookConnectionAtom)
    const sheet = get(activeWorkbookSheetAtom)
    const drawing = get(sheetDrawingsAtom).find((entry) => entry.id === input.id)
    if (!connection || !sheet || !drawing) return false
    set(clipboardAtom, { connection, sheetId: sheet.id, drawing })
    return input.cut ? set(changeSheetDrawingAtom, { type: 'remove', id: drawing.id }) : true
  })
copyDrawingAtom.debugLabel = 'spreadsheet.drawings.copy'

function uniqueId(drawing: SheetDrawing, existing: readonly SheetDrawing[]): string {
  const used = new Set(existing.map((entry) => entry.id))
  if (!used.has(drawing.id)) return drawing.id
  let index = existing.length + 1
  while (used.has(`${drawing.kind}-${index}`)) index += 1
  return `${drawing.kind}-${index}`
}

/**
 * 粘贴为新对象（新 id，一条撤销记录）并选中。给出单元格时放在该格左上角，
 * 否则在原位置右下错开 20px，同 Excel 的连续粘贴。
 */
export const pasteDrawingAtom = atom(null,
  async (get, set, at?: { readonly row: number; readonly col: number }): Promise<boolean> => {
    const clipboard = get(clipboardAtom)
    if (!clipboard || !get(drawingClipboardAtom).pasteHere) return false
    const source = clipboard.drawing
    const drawings = get(sheetDrawingsAtom)
    const offset = (value: number) => Math.min(MAX_DRAWING_SIZE_PX, value + 20)
    const anchor = at
      ? { ...source.anchor, row: at.row, col: at.col, offsetX: 0, offsetY: 0 }
      : { ...source.anchor, offsetX: offset(source.anchor.offsetX),
        offsetY: offset(source.anchor.offsetY) }
    const id = uniqueId(source, drawings)
    const changed = await set(changeSheetDrawingAtom,
      { type: 'set', drawing: { ...source, id, anchor } })
    if (changed) {
      set(selectDrawingAtom, id)
      // 连续粘贴继续错开，而不是叠在同一位置。
      if (!at) set(clipboardAtom, { ...clipboard, drawing: { ...source, anchor } })
    }
    return changed
  })
pasteDrawingAtom.debugLabel = 'spreadsheet.drawings.paste'
