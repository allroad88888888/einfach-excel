import type { VisibleProjectionRequest } from '../backend'
import type { RustWorkbookSheet } from './commands'

export const STRUCTURE_ACTIONS = ['insert-rows', 'insert-columns', 'delete-rows', 'delete-columns'] as const
export type StructureAction = (typeof STRUCTURE_ACTIONS)[number]
export interface StructuralEdit {
  readonly action: StructureAction
  readonly at: number
  readonly count: number
}

/** 只计算宿主画布尺寸，不移动、读取或复制任何单元格数据。两端共用相同的预检。 */
export function structureSheet(sheet: RustWorkbookSheet, edit: StructuralEdit, undo = false) {
  const { rowCount, colCount } = sheet
  if (!Number.isSafeInteger(rowCount) || !Number.isSafeInteger(colCount) ||
    !rowCount || !colCount || rowCount < 1 || colCount < 1 ||
    rowCount > 1_048_576 || colCount > 16_384)
    throw new Error('Worksheet bounds are unavailable.')
  if (!STRUCTURE_ACTIONS.includes(edit.action) || !Number.isSafeInteger(edit.at) ||
    !Number.isSafeInteger(edit.count) || edit.at < 0 || edit.count < 1)
    throw new Error('Invalid structural edit range.')
  const rows = edit.action.endsWith('rows')
  const insert = edit.action.startsWith('insert') !== undo
  const size = rows ? rowCount : colCount
  const next = size + (insert ? edit.count : -edit.count)
  if (edit.at > size || (!insert && edit.at + edit.count > size) || next < 1)
    throw new Error('Keep at least one row and one column in the worksheet.')
  if (next > (rows ? 1_048_576 : 16_384)) throw new Error('The worksheet size limit would be exceeded.')
  return { ...sheet, rowCount: rows ? next : rowCount, colCount: rows ? colCount : next }
}

/** 删除末尾行列后保持窗口大小，窗口整体退回合法区域，而非发布越界投影。 */
export function structureProjectionRequest(
  request: VisibleProjectionRequest,
  sheet: RustWorkbookSheet,
): VisibleProjectionRequest {
  const w = request.window
  const bounds = [w.rowStart, w.rowEnd, w.colStart, w.colEnd]
  if (!bounds.every((n) => Number.isSafeInteger(n) && n >= 0) ||
    w.rowStart > w.rowEnd || w.colStart > w.colEnd) throw new Error('Invalid projection window.')
  const rows = Math.min(w.rowEnd - w.rowStart + 1, sheet.rowCount!)
  const cols = Math.min(w.colEnd - w.colStart + 1, sheet.colCount!)
  const rowStart = Math.min(w.rowStart, sheet.rowCount! - rows)
  const colStart = Math.min(w.colStart, sheet.colCount! - cols)
  return {
    ...request,
    window: { rowStart, colStart, rowEnd: rowStart + rows - 1, colEnd: colStart + cols - 1 },
  }
}

/** 覆盖新旧画布，清掉已经被删除的尾部尺寸缓存；数据仍只读取可见窗口。 */
export function structureSizeRange(before: RustWorkbookSheet, after: RustWorkbookSheet) {
  return { rowStart: 0, colStart: 0,
    rowEnd: Math.max(before.rowCount!, after.rowCount!) - 1,
    colEnd: Math.max(before.colCount!, after.colCount!) - 1 }
}
