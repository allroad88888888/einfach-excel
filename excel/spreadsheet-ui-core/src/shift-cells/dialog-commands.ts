import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { selectionSnapshotAtom } from '../selection'
import { runSelectionStructureAtom } from '../toolbar/selection-structure-command'
import {
  CLOSED_SHIFT_CELLS_DIALOG,
  SHIFT_CELLS_CHOICES,
  cellContextMenuAtom,
  shiftCellsDialogAtom,
  type ShiftCellsChoice,
  type ShiftCellsMode,
} from './state'

export interface OpenShiftCellsDialogInput {
  readonly mode: ShiftCellsMode
  /** 快捷键在整行/整列选区上直接插删行列，与 Excel 一致；其它入口总是打开对话框。 */
  readonly source?: 'keyboard' | 'menu'
}

/** 打开“插入…”/“删除…”；整行/整列快捷键直接走既有行列命令，不弹窗。 */
export const openShiftCellsDialogAtom = atom(
  null,
  async (get, set, input: OpenShiftCellsDialogInput): Promise<boolean> => {
    if (input.mode !== 'insert' && input.mode !== 'delete') return false
    if (get(editingSessionAtom).source !== null || get(shiftCellsDialogAtom).busy) return false
    set(cellContextMenuAtom, null)
    const kind = get(selectionSnapshotAtom).selection.kind
    if (input.source === 'keyboard' && (kind === 'row' || kind === 'column')) {
      const axis = kind === 'row' ? 'rows' : 'columns'
      return set(runSelectionStructureAtom, `${input.mode}-${axis}`)
    }
    set(shiftCellsDialogAtom, {
      mode: input.mode,
      choice: input.mode === 'insert' ? 'shift-down' : 'shift-up',
      busy: false,
      error: null,
    })
    return true
  },
)
openShiftCellsDialogAtom.debugLabel = 'spreadsheet.shiftCells.open'

/** 只接受当前对话框列出的选项。 */
export const chooseShiftCellsOptionAtom = atom(null, (get, set, choice: ShiftCellsChoice) => {
  const state = get(shiftCellsDialogAtom)
  if (state.mode === null || state.busy || !SHIFT_CELLS_CHOICES[state.mode].includes(choice))
    return false
  set(shiftCellsDialogAtom, { ...state, choice, error: null })
  return true
})
chooseShiftCellsOptionAtom.debugLabel = 'spreadsheet.shiftCells.choose'

export const closeShiftCellsDialogAtom = atom(null, (get, set) => {
  if (get(shiftCellsDialogAtom).busy) return false
  set(shiftCellsDialogAtom, CLOSED_SHIFT_CELLS_DIALOG)
  return true
})
closeShiftCellsDialogAtom.debugLabel = 'spreadsheet.shiftCells.close'

/** 右键菜单只在非编辑态打开；坐标由 DOM 层给出。 */
export const openCellContextMenuAtom = atom(
  null,
  (get, set, position: { readonly x: number; readonly y: number }) => {
    if (get(editingSessionAtom).source !== null || get(shiftCellsDialogAtom).mode !== null)
      return false
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false
    set(cellContextMenuAtom, { x: Math.max(0, position.x), y: Math.max(0, position.y) })
    return true
  },
)
openCellContextMenuAtom.debugLabel = 'spreadsheet.shiftCells.openContextMenu'

export const closeCellContextMenuAtom = atom(null, (_get, set) => {
  set(cellContextMenuAtom, null)
})
closeCellContextMenuAtom.debugLabel = 'spreadsheet.shiftCells.closeContextMenu'
