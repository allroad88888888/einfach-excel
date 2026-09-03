/**
 * Terminal settlement order for the editing lane.
 * The active ticket remains published until terminal state has been written in order.
 */
import type { Getter, Setter } from '@einfach/core'
import { keyboardModeAtom } from '../keyboard'
import {
  activeEditingCommitTicketAtom,
  editingCommitLifecycleBackingAtom,
  editingRawTransportIsSettled,
  editingRawTransportStateAtom,
  editingSessionBackingAtom,
  editingTicketIsCurrent,
  lifecycleFor,
  lifecycleForTicket,
  type EditingCommitTicket,
} from './commit-state'
import { releaseEditingHistoryProjection } from './history-projection'
import { createEditingSessionState } from './session-domain'
import type { EditingCommitLifecycleState, EditingCommitOutcome } from './types'

/** Clears raw state first, publishes terminal projections, then releases the lane lock last. */
export function finalizeEditingTicket(
  get: Getter,
  set: Setter,
  ticket: EditingCommitTicket,
  lifecycleWitness: EditingCommitLifecycleState,
): boolean {
  if (!editingTicketIsCurrent(get, ticket, lifecycleWitness)) return false
  if (!releaseEditingHistoryProjection(set, ticket.historyReservation)) return false
  if (!editingTicketIsCurrent(get, ticket, lifecycleWitness)) return false
  set(editingRawTransportStateAtom, (raw) => (raw?.requestId === ticket.requestId ? null : raw))
  set(editingSessionBackingAtom, createEditingSessionState())
  set(editingCommitLifecycleBackingAtom, lifecycleFor('ready', { sessionId: ticket.sessionId }))
  set(keyboardModeAtom, 'navigation')
  set(activeEditingCommitTicketAtom, null)
  return true
}

export function completeEditingTicket(
  get: Getter,
  set: Setter,
  ticket: EditingCommitTicket,
  lifecycleWitness: EditingCommitLifecycleState,
): EditingCommitOutcome {
  if (
    !editingTicketIsCurrent(get, ticket, lifecycleWitness) ||
    !editingRawTransportIsSettled(get, ticket)
  ) {
    return 'blocked'
  }
  return finalizeEditingTicket(get, set, ticket, lifecycleWitness) ? 'completed' : 'blocked'
}

/** Releases a known failed transport while retaining the staged draft for retry. */
export function rejectEditingTicket(
  get: Getter,
  set: Setter,
  ticket: EditingCommitTicket,
  lifecycleWitness: EditingCommitLifecycleState,
  detail: string,
): EditingCommitOutcome {
  if (
    !editingTicketIsCurrent(get, ticket, lifecycleWitness) ||
    !editingRawTransportIsSettled(get, ticket)
  ) {
    return 'blocked'
  }
  if (!releaseEditingHistoryProjection(set, ticket.historyReservation)) {
    set(
      editingCommitLifecycleBackingAtom,
      lifecycleForTicket(
        'outcome-unknown',
        ticket,
        null,
        'Editing commit was rejected, but UI history ownership could not be released.',
      ),
    )
    return 'outcome-unknown'
  }
  if (!editingTicketIsCurrent(get, ticket, lifecycleWitness)) return 'blocked'
  set(editingRawTransportStateAtom, (raw) => (raw?.requestId === ticket.requestId ? null : raw))
  const rejectedLifecycle = lifecycleForTicket('rejected', ticket, null, detail)
  set(editingCommitLifecycleBackingAtom, rejectedLifecycle)
  // Clear the lane only after observers can see the complete rejected state.
  set(activeEditingCommitTicketAtom, null)
  return 'rejected'
}
