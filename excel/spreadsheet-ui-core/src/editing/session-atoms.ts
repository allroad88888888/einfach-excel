/**
 * Public synchronous editing atoms.
 * The asynchronous Rust transaction lives in commit-cell-editing.ts.
 */
import { atom, type Atom, type Getter, type Setter } from '@einfach/core'
import { activeWorkbookSheetAtom, workbookDocumentAtom } from '../runtime/workbook-document'
import { activateWorkbookSheetAtom } from '../runtime/activate-workbook-sheet'
import { sheetViewsBackingAtom } from '../runtime/sheet-view-state'
import { selectCellAtom, selectionSnapshotAtom } from '../selection'
import { scrollToCellAtom } from '../viewport/metrics'
import { keyboardModeAtom } from '../keyboard'
import { resetFormulaReferenceStateAtom } from '../formula-reference/state'
import {
  activeEditingCommitTicketAtom,
  editingCommitLifecycleBackingAtom,
  editingSessionBackingAtom,
  lifecycleFor,
} from './commit-state'
import {
  cancelEditingSessionState,
  startEditingSessionState,
  updateEditingDraftState,
} from './session-domain'
import type { EditingDraftInput, EditingSessionState, EditingStartInput } from './types'

export const editingSessionAtom: Atom<EditingSessionState> = atom((get) =>
  get(editingSessionBackingAtom),
)
editingSessionAtom.debugLabel = 'spreadsheet.editing.session'

export const editingIsActiveAtom = atom((get) => get(editingSessionAtom).status === 'drafting')
editingIsActiveAtom.debugLabel = 'spreadsheet.editing.isActive'

/** 拾取结束后回到唯一编辑源；选区未离开时保持原有同表编辑行为。 */
export function returnToEditingSource(
  get: Getter, set: Setter, session: EditingSessionState,
): void {
  const source = session.source
  if (!source) return
  if (get(activeWorkbookSheetAtom)?.id !== source.sheetId ||
    get(sheetViewsBackingAtom).referenceBrowsing) {
    const sheet = get(workbookDocumentAtom).sheets.find((item) => item.id === source.sheetId)
    // 恢复跨表前的完整选区及浏览位置；没有记忆的测试／外部编辑源再按原坐标定位。
    if (!sheet) return
    set(activateWorkbookSheetAtom, sheet)
  }
  const selected = get(selectionSnapshotAtom).activeCell
  if (selected.sheetId !== source.sheetId ||
    selected.row !== source.cell.row || selected.col !== source.cell.col) {
    set(selectCellAtom, { sheetId: source.sheetId, coord: source.cell, extend: false })
    set(scrollToCellAtom, { coord: source.cell })
  }
}

export const editingDraftAtom = atom(
  (get) => get(editingSessionAtom).draft,
  (get, set, input: EditingDraftInput) => {
    // Once a ticket owns the lane, the submitted draft must stay identical to its request.
    if (get(activeEditingCommitTicketAtom) !== null) return
    set(editingSessionBackingAtom, updateEditingDraftState(get(editingSessionAtom), input))
  },
)
editingDraftAtom.debugLabel = 'spreadsheet.editing.draft'

/** 在输入框给出的选中文字范围插入一个换行；返回新的 DOM 光标位置。 */
export const insertEditingLineBreakAtom = atom(
  null,
  (get, set, range: { start: number; end: number }): number | null => {
    if (get(activeEditingCommitTicketAtom) !== null || !get(editingSessionAtom).source) return null
    const draft = get(editingDraftAtom)
    const start = Math.max(0, Math.min(draft.length, range.start))
    const end = Math.max(start, Math.min(draft.length, range.end))
    set(editingDraftAtom, { draft: `${draft.slice(0, start)}\n${draft.slice(end)}` })
    return start + 1
  },
)

export const startEditingAtom = atom(
  (get) => get(editingSessionAtom),
  (get, set, input: EditingStartInput) => {
    if (get(activeEditingCommitTicketAtom) !== null) return get(editingSessionAtom)
    set(resetFormulaReferenceStateAtom)
    const session = startEditingSessionState(get(editingSessionAtom), input)
    set(editingSessionBackingAtom, session)
    set(editingCommitLifecycleBackingAtom, lifecycleFor('ready'))
    set(keyboardModeAtom, 'editing')
    return session
  },
)
startEditingAtom.debugLabel = 'spreadsheet.editing.start'

export const cancelEditingAtom = atom(
  (get) => get(editingSessionAtom),
  (get, set) => {
    // Cancellation cannot steal ownership from an in-flight or outcome-unknown transaction.
    if (get(activeEditingCommitTicketAtom) !== null) return null
    const state = get(editingSessionAtom)
    if (state.source === null) return null

    returnToEditingSource(get, set, state)
    set(resetFormulaReferenceStateAtom)
    set(editingSessionBackingAtom, cancelEditingSessionState(state))
    set(editingCommitLifecycleBackingAtom, lifecycleFor('ready'))
    set(keyboardModeAtom, 'navigation')
    return true
  },
)
cancelEditingAtom.debugLabel = 'spreadsheet.editing.cancel'
