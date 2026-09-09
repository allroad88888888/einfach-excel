import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { projectionSnapshotAtom } from '../projection'
import { selectionSnapshotAtom, selectionRegionsAtom, selectionBoundsAtom, setSelectionAtom } from '../selection'
import { rangeEquals, type CellCoord, type CellRange } from '../shared'
import { directionalFillFeedbackAtom, fillSelectionAtom } from './directional-command'
import type { RustFillRangeRequest } from '../rust-workbook/commands'

interface FillDrag {
  readonly sheetId: string
  readonly source: CellRange
  readonly range: CellRange
  readonly direction: RustFillRangeRequest['direction'] | null
  readonly copy: boolean
}
const dragAtom = atom<FillDrag | null>(null)
/** 只保存未提交的选区几何，不保存样本值或另一份工作簿。 */
export const fillHandleDragAtom = atom((get) => {
  const drag = get(dragAtom)
  const selection = get(selectionSnapshotAtom)
  return drag && drag.sheetId === selection.selection.sheetId &&
    rangeEquals(drag.source, selection.range) ? drag : null
})
type Action = { type: 'start'; copy: boolean } | { type: 'move'; coord: CellCoord } |
  { type: 'copy'; copy: boolean } | { type: 'cancel' } | { type: 'finish'; copy: boolean }

/** 指针只提交坐标；松手才复用一次 range.fill，取消不产生历史。 */
export const dragFillHandleAtom = atom(null, async (get, set, action: Action): Promise<void> => {
  if (action.type === 'cancel') { set(dragAtom, null); return }
  if (action.type === 'start') {
    const selection = get(selectionSnapshotAtom)
    const projection = get(projectionSnapshotAtom)
    const sheetId = selection.selection.sheetId
    if (!sheetId || !['cell', 'range'].includes(selection.selection.kind) ||
      get(selectionRegionsAtom).length !== 1 ||
      get(directionalFillFeedbackAtom).busy || get(editingSessionAtom).source ||
      projection.status !== 'ready' || projection.result?.sheetId !== sheetId) return
    set(dragAtom, { sheetId, source: selection.range, range: selection.range,
      direction: null, copy: action.copy })
    return
  }
  const drag = get(fillHandleDragAtom)
  if (!drag) { set(dragAtom, null); return }
  if (action.type === 'copy') { set(dragAtom, { ...drag, copy: action.copy }); return }
  if (action.type === 'move') {
    const bounds = get(selectionBoundsAtom)
    const { row, col } = action.coord
    if (!Number.isSafeInteger(row) || !Number.isSafeInteger(col) || row < 0 || col < 0 ||
      row >= bounds.rowCount || col >= bounds.colCount) return
    const s = drag.source
    const dy = row < s.rowStart ? row - s.rowStart : Math.max(0, row - s.rowEnd)
    const dx = col < s.colStart ? col - s.colStart : Math.max(0, col - s.colEnd)
    // 对角拖动取延伸格数更多的轴，平局保持上一轴；永远不写一个含糊的二维外圈。
    const vertical = Math.abs(dy) > Math.abs(dx) || (Math.abs(dy) === Math.abs(dx) &&
      drag.direction !== 'left' && drag.direction !== 'right')
    const direction = !dx && !dy ? null : vertical ? (dy < 0 ? 'up' : 'down') : (dx < 0 ? 'left' : 'right')
    const range = direction === 'down' ? { ...s, rowEnd: row }
      : direction === 'up' ? { ...s, rowStart: row }
        : direction === 'right' ? { ...s, colEnd: col }
          : direction === 'left' ? { ...s, colStart: col } : s
    set(dragAtom, { ...drag, direction, range })
    return
  }
  set(dragAtom, null)
  if (!drag.direction) return
  const success = await set(fillSelectionAtom, {
    direction: drag.direction, sheetId: drag.sheetId, sourceRange: drag.source,
    range: drag.range, auto: !action.copy,
  })
  const selection = get(selectionSnapshotAtom)
  if (success && selection.selection.sheetId === drag.sheetId &&
    rangeEquals(selection.range, drag.source)) {
    set(setSelectionAtom, { kind: 'range', sheetId: drag.sheetId,
      anchor: { row: drag.range.rowStart, col: drag.range.colStart },
      focus: { row: drag.range.rowEnd, col: drag.range.colEnd },
    })
  }
})
