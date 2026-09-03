/**
 * Public synchronous editing atoms.
 * Async Rust transport, acknowledgement, timeline projection, and refresh sequencing live in run-commit.ts.
 */
import { atom, type Atom } from '@einfach/core'
import { keyboardModeAtom } from '../keyboard'
import {
  activeEditingCommitTicketAtom,
  editingCommitLifecycleBackingAtom,
  editingIntentBackingAtom,
  editingSessionBackingAtom,
  editingSessionSequenceAtom,
  lifecycleFor,
  nextSafeEditingIdentity,
} from './commit-state'
import {
  cancelEditingSessionState,
  createEditingCancelIntent,
  createEditingStartIntent,
  startEditingSessionState,
  updateEditingDraftState,
} from './session-domain'
import type {
  EditingDraftInput,
  EditingIntent,
  EditingSessionState,
  EditingStartInput,
} from './types'

export const editingSessionAtom: Atom<EditingSessionState> = atom((get) =>
  get(editingSessionBackingAtom),
)
editingSessionAtom.debugLabel = 'spreadsheet.editing.session'

export const editingIntentAtom: Atom<EditingIntent | null> = atom((get) =>
  get(editingIntentBackingAtom),
)
editingIntentAtom.debugLabel = 'spreadsheet.editing.intent'

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

export const startEditingAtom = atom(
  (get) => get(editingSessionAtom),
  (get, set, input: EditingStartInput) => {
    if (get(activeEditingCommitTicketAtom) !== null) return get(editingSessionAtom)
    const sessionId = nextSafeEditingIdentity(get(editingSessionSequenceAtom))
    if (sessionId === null) return get(editingSessionAtom)
    const session = startEditingSessionState(get(editingSessionAtom), input)
    // Publish the new identity before its observable session and keyboard projections.
    set(editingSessionSequenceAtom, sessionId)
    set(editingSessionBackingAtom, session)
    set(editingIntentBackingAtom, createEditingStartIntent(input))
    set(editingCommitLifecycleBackingAtom, lifecycleFor('ready', { sessionId }))
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
    const intent = createEditingCancelIntent(state)
    if (intent === null) return null

    set(editingIntentBackingAtom, intent)
    set(editingSessionBackingAtom, cancelEditingSessionState(state))
    set(
      editingCommitLifecycleBackingAtom,
      lifecycleFor('ready', { sessionId: get(editingSessionSequenceAtom) }),
    )
    set(keyboardModeAtom, 'navigation')
    return intent
  },
)
cancelEditingAtom.debugLabel = 'spreadsheet.editing.cancel'
