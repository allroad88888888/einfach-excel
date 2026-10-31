import { atom } from '@einfach/core'

/** “插入…”/“删除…”对话框；null 表示关闭。 */
export type ShiftCellsMode = 'insert' | 'delete'

export type ShiftCellsChoice =
  | 'shift-right'
  | 'shift-down'
  | 'shift-left'
  | 'shift-up'
  | 'entire-row'
  | 'entire-column'

export interface ShiftCellsDialogState {
  readonly mode: ShiftCellsMode | null
  readonly choice: ShiftCellsChoice
  readonly busy: boolean
  readonly error: string | null
}

export const SHIFT_CELLS_CHOICES: Readonly<Record<ShiftCellsMode, readonly ShiftCellsChoice[]>> = {
  insert: ['shift-right', 'shift-down', 'entire-row', 'entire-column'],
  delete: ['shift-left', 'shift-up', 'entire-row', 'entire-column'],
}

export const CLOSED_SHIFT_CELLS_DIALOG: ShiftCellsDialogState = Object.freeze({
  mode: null,
  choice: 'shift-down',
  busy: false,
  error: null,
})

export const shiftCellsDialogAtom = atom<ShiftCellsDialogState>(CLOSED_SHIFT_CELLS_DIALOG)
shiftCellsDialogAtom.debugLabel = 'spreadsheet.shiftCells.dialog'

/** 单元格右键菜单的视口坐标；null 表示关闭。 */
export interface CellContextMenuState {
  readonly x: number
  readonly y: number
}

export const cellContextMenuAtom = atom<CellContextMenuState | null>(null)
cellContextMenuAtom.debugLabel = 'spreadsheet.shiftCells.contextMenu'
