/** Private lifecycle and one-lane serialization state for cell editing. */
import { atom, type Atom, type Getter } from '@einfach/core'
import type {
  EditingCommitLifecycleState,
  EditingCommitOutcome,
  EditingCommitRequest,
  EditingSessionState,
} from './types'
import { createEditingSessionState } from './session-domain'

export interface EditingCommitTicket {
  /** Object identity, not duplicated status fields, owns the asynchronous lane. */
  readonly request: EditingCommitRequest
  /** 后续编辑等这一次写入的结果，不重发请求，也不另建队列。 */
  readonly completion: Promise<EditingCommitOutcome>
}

const INITIAL_EDITING_LIFECYCLE: EditingCommitLifecycleState = Object.freeze({
  status: 'ready',
  error: '',
})

export function lifecycleFor(
  status: EditingCommitLifecycleState['status'],
  error = '',
): EditingCommitLifecycleState {
  return Object.freeze({ status, error })
}

export const editingSessionBackingAtom = atom<EditingSessionState>(createEditingSessionState())
editingSessionBackingAtom.debugLabel = 'spreadsheet.editing.sessionBacking'

export const editingCommitLifecycleBackingAtom =
  atom<EditingCommitLifecycleState>(INITIAL_EDITING_LIFECYCLE)
editingCommitLifecycleBackingAtom.debugLabel = 'spreadsheet.editing.commitLifecycleBacking'

export const activeEditingCommitTicketAtom = atom<EditingCommitTicket | null>(null)
activeEditingCommitTicketAtom.debugLabel = 'spreadsheet.editing.activeCommitTicket'

export function editingTicketIsCurrent(
  get: Getter,
  ticket: EditingCommitTicket,
  lifecycleWitness?: EditingCommitLifecycleState,
): boolean {
  const lifecycle = get(editingCommitLifecycleBackingAtom)
  return (
    get(activeEditingCommitTicketAtom) === ticket &&
    (lifecycleWitness === undefined || lifecycle === lifecycleWitness)
  )
}

export const editingCommitLifecycleAtom: Atom<EditingCommitLifecycleState> = atom((get) =>
  get(editingCommitLifecycleBackingAtom),
)
editingCommitLifecycleAtom.debugLabel = 'spreadsheet.editing.commitLifecycle'
