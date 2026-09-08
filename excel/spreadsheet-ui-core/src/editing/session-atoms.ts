/**
 * Public synchronous editing atoms.
 * The asynchronous Rust transaction lives in commit-cell-editing.ts.
 */
import { atom, type Atom } from '@einfach/core'
import { keyboardModeAtom } from '../keyboard'
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

    set(editingSessionBackingAtom, cancelEditingSessionState(state))
    set(editingCommitLifecycleBackingAtom, lifecycleFor('ready'))
    set(keyboardModeAtom, 'navigation')
    return true
  },
)
cancelEditingAtom.debugLabel = 'spreadsheet.editing.cancel'
