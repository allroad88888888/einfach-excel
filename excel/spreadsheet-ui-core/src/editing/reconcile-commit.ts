/**
 * Explicit reconciliation for a timed-out mutation with a now-settled raw promise.
 * Reconciliation never guesses the backend outcome and never resends the mutation.
 */
import { atom } from '@einfach/core'
import {
  activeEditingCommitTicketAtom,
  editingCommitLifecycleBackingAtom,
  editingRawTransportIsSettled,
  editingRawTransportStateAtom,
  editingTicketIsCurrent,
} from './commit-state'
import { finalizeEditingTicket } from './commit-settlement'

/** Releases a retained commit only after its raw mutation promise settles. */
export const reconcileEditingCommitAtom = atom(null, (get, set): boolean => {
  const ticket = get(activeEditingCommitTicketAtom)
  const lifecycle = get(editingCommitLifecycleBackingAtom)
  const raw = get(editingRawTransportStateAtom)
  if (
    ticket === null ||
    raw?.requestId !== ticket.requestId ||
    raw.settled !== true ||
    !editingTicketIsCurrent(get, ticket, lifecycle)
  ) {
    return false
  }

  if (
    !editingTicketIsCurrent(get, ticket, lifecycle) ||
    !editingRawTransportIsSettled(get, ticket)
  ) {
    return false
  }
  return finalizeEditingTicket(get, set, ticket, lifecycle)
})
reconcileEditingCommitAtom.debugLabel = 'spreadsheet.editing.reconcileCommit'

/** Alias for hosts that present explicit reconciliation as a reset action. */
export const resetEditingCommitAtom = reconcileEditingCommitAtom
