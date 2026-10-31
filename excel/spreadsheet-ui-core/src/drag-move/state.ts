import { atom } from '@einfach/core'
import { selectionSnapshotAtom } from '../selection'
import { rangeEquals, type CellCoord, type CellRange } from '../shared'

export interface DragMoveSession {
  readonly sheetId: string
  readonly source: CellRange
  /** 抓住的格相对来源左上角的偏移。 */
  readonly grab: CellCoord
  readonly target: CellRange
  readonly copy: boolean
}

/** 只保存未提交的拖动几何；数据始终在 Rust，松手前不写任何格。 */
export const dragMoveSessionBackingAtom = atom<DragMoveSession | null>(null)
dragMoveSessionBackingAtom.debugLabel = 'spreadsheet.dragMove.sessionBacking'

/** 选区一旦变化（切表、键盘移动），未完成的拖动自动失效。 */
export const dragMoveSessionAtom = atom((get) => {
  const session = get(dragMoveSessionBackingAtom)
  const selection = get(selectionSnapshotAtom)
  return session && session.sheetId === selection.selection.sheetId &&
    rangeEquals(session.source, selection.range) ? session : null
})
dragMoveSessionAtom.debugLabel = 'spreadsheet.dragMove.session'

export interface DragMoveFeedback {
  readonly busy: boolean
  readonly error: string
}

export const dragMoveFeedbackBackingAtom = atom<DragMoveFeedback>({ busy: false, error: '' })
dragMoveFeedbackBackingAtom.debugLabel = 'spreadsheet.dragMove.feedbackBacking'

export const dragMoveFeedbackAtom = atom((get) => get(dragMoveFeedbackBackingAtom))
dragMoveFeedbackAtom.debugLabel = 'spreadsheet.dragMove.feedback'
