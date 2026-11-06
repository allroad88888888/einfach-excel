import type { DrawingRange, SheetDrawing } from '../../drawings/types'
import type { RustWorkbookSheet } from '../commands'

/** Rust 侧的引用：`sheet` 是工作表稳定 key（改名、移动、撤销删除不变），缺省是对象所在表。 */
interface RustDrawingRange extends Omit<DrawingRange, 'sheetId'> {
  readonly sheet?: number | string
}
export interface RustSheetDrawing extends Omit<SheetDrawing, 'refs'> {
  readonly refs: readonly (RustDrawingRange | null)[]
}

/**
 * Rust key → UI 的 sheetId。已删除的表仍在目录里（index < 0），照样映射，读取方据此显示 #REF!，
 * 撤销删表后自然恢复；Worker 从没见过的 key 才视为 #REF!。
 */
export function fromRustDrawing(drawing: RustSheetDrawing,
  sheets: ReadonlyMap<string, RustWorkbookSheet>): SheetDrawing {
  const byKey = new Map([...sheets.values()].filter((sheet) => sheet.key !== undefined)
    .map((sheet) => [String(sheet.key), sheet.id]))
  return { ...drawing, refs: drawing.refs.map((range) => {
    if (!range) return null
    const { sheet, ...cells } = range
    if (sheet === undefined) return cells
    const sheetId = byKey.get(String(sheet))
    return sheetId ? { ...cells, sheetId } : null
  }) }
}

/** UI 的 sheetId → Rust key；指向对象所在表时省略，指向不存在或已删除的表直接拒绝。 */
export function toRustDrawing(drawing: SheetDrawing, ownerId: string,
  sheets: ReadonlyMap<string, RustWorkbookSheet>): RustSheetDrawing {
  return { ...drawing, refs: drawing.refs.map((range) => {
    if (!range) return null
    const { sheetId, ...cells } = range
    if (sheetId === undefined || sheetId === ownerId) return cells
    const sheet = sheets.get(sheetId)
    if (!sheet || sheet.index < 0 || sheet.key === undefined)
      throw new Error('The object data worksheet does not exist.')
    return { ...cells, sheet: Number(sheet.key) }
  }) }
}
