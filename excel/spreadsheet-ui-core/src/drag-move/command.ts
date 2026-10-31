import { atom } from '@einfach/core'
import { clipboardErrorMessage } from '../clipboard/error-messages'
import { systemClipboardFeedbackAtom } from '../clipboard/system-clipboard-command'
import { directionalFillFeedbackAtom } from '../auto-fill/directional-command'
import { editingSessionAtom } from '../editing/session-atoms'
import { projectionSnapshotAtom } from '../projection'
import {
  selectionBoundsAtom, selectionRegionsAtom, selectionSnapshotAtom, setSelectionAtom,
} from '../selection'
import { rangeEquals, type CellCoord } from '../shared'
import { selectionMergeFeedbackAtom } from '../toolbar/selection-merge-state'
import { selectionStructureFeedbackAtom } from '../toolbar/selection-structure-state'
import {
  dragMoveFeedbackBackingAtom, dragMoveSessionAtom, dragMoveSessionBackingAtom,
} from './state'
import { dragMoveGrabOffset, dragMoveTargetRange } from './target-range'
import { requestDragTransferAtom } from './transfer'

export type DragMoveAction =
  | { readonly type: 'start'; readonly coord: CellCoord; readonly copy: boolean }
  | { readonly type: 'move'; readonly coord: CellCoord }
  | { readonly type: 'copy'; readonly copy: boolean }
  | { readonly type: 'cancel' }
  | {
      readonly type: 'finish'
      readonly copy: boolean
      /** 目标区已有内容时询问用户；返回 false 则什么都不写。 */
      readonly confirmReplace: () => boolean
    }

const validCoord = (coord: CellCoord, bounds: { rowCount: number; colCount: number }) =>
  Number.isSafeInteger(coord.row) && Number.isSafeInteger(coord.col) && coord.row >= 0 &&
  coord.col >= 0 && coord.row < bounds.rowCount && coord.col < bounds.colCount

/** 拖动选区边框：指针只报坐标，松手才发一次原生移动／复制；Escape 取消不留历史。 */
export const dragMoveSelectionAtom = atom(null, async (
  get, set, action: DragMoveAction,
): Promise<boolean> => {
  if (action.type === 'cancel') { set(dragMoveSessionBackingAtom, null); return false }
  if (action.type === 'start') {
    set(dragMoveSessionBackingAtom, null)
    const snapshot = get(selectionSnapshotAtom)
    const projection = get(projectionSnapshotAtom)
    const sheetId = snapshot.selection.sheetId
    if (!sheetId || !['cell', 'range'].includes(snapshot.selection.kind) ||
      get(selectionRegionsAtom).length !== 1 || get(editingSessionAtom).source !== null ||
      get(dragMoveFeedbackBackingAtom).busy || get(systemClipboardFeedbackAtom).busy ||
      get(directionalFillFeedbackAtom).busy || get(selectionStructureFeedbackAtom).busy ||
      get(selectionMergeFeedbackAtom).busy || projection.status !== 'ready' ||
      projection.result?.sheetId !== sheetId) return false
    const source = snapshot.range
    set(dragMoveSessionBackingAtom, {
      sheetId, source, grab: dragMoveGrabOffset(source, action.coord),
      target: source, copy: action.copy,
    })
    set(dragMoveFeedbackBackingAtom, { busy: false, error: '' })
    return true
  }
  const session = get(dragMoveSessionAtom)
  if (!session) { set(dragMoveSessionBackingAtom, null); return false }
  if (action.type === 'copy') {
    if (session.copy !== action.copy)
      set(dragMoveSessionBackingAtom, { ...session, copy: action.copy })
    return true
  }
  if (action.type === 'move') {
    const bounds = get(selectionBoundsAtom)
    if (!validCoord(action.coord, bounds)) return false
    const target = dragMoveTargetRange(session.source, session.grab, action.coord, bounds)
    if (!rangeEquals(target, session.target))
      set(dragMoveSessionBackingAtom, { ...session, target })
    return true
  }
  set(dragMoveSessionBackingAtom, null)
  if (rangeEquals(session.target, session.source)) return false
  const request = {
    sheetId: session.sheetId, source: session.source, copy: action.copy,
    target: { row: session.target.rowStart, col: session.target.colStart },
  }
  set(dragMoveFeedbackBackingAtom, { busy: true, error: '' })
  try {
    let outcome = await set(requestDragTransferAtom, { ...request, replace: false })
    if (outcome.status === 'occupied') {
      if (!action.confirmReplace()) {
        set(dragMoveFeedbackBackingAtom, { busy: false, error: '' })
        return false
      }
      outcome = await set(requestDragTransferAtom, { ...request, replace: true })
    }
    if (outcome.status !== 'applied') throw new Error('Invalid drag move acknowledgement.')
    set(dragMoveFeedbackBackingAtom, { busy: false, error: '' })
    const current = get(selectionSnapshotAtom)
    // 等待期间用户另选了格就尊重新选区；否则像 Excel 一样选中落点。
    if (current.selection.sheetId === session.sheetId && rangeEquals(current.range, session.source))
      set(setSelectionAtom, {
        kind: 'range', sheetId: session.sheetId,
        anchor: { row: outcome.range.rowStart, col: outcome.range.colStart },
        focus: { row: outcome.range.rowEnd, col: outcome.range.colEnd },
      })
    return true
  } catch (error) {
    set(dragMoveFeedbackBackingAtom, { busy: false, error: clipboardErrorMessage(error) })
    return false
  }
})
dragMoveSelectionAtom.debugLabel = 'spreadsheet.dragMove.dragSelection'
