import type { Getter, Setter } from '@einfach/core'
import type { ProjectionRequestId } from '../backend/types'
import { releaseHistoryProducerReservationAtom } from '../history'
import {
  primarySelectionRegionAtom,
  selectionAuthorityWitnessAtom,
  selectionRangeAtom,
} from '../selection'
import { workspaceActiveSheetAuthorityWitnessAtom, workspaceSessionAtom } from '../workspace'
import {
  REMOVE_DUPLICATES_OUTCOME_UNKNOWN_ERROR,
  REMOVE_DUPLICATES_READ_STALE_ERROR,
  REMOVE_DUPLICATES_REFRESH_ERROR_PREFIX,
} from './constants'
import { errorMessage, lifecycleFor, withRemoveDuplicatesTimeout } from './domain'
import { closeSession } from './dialog-commands'
import {
  activeRemoveDuplicatesMutationAtom,
  removeDuplicatesErrorStateAtom,
  removeDuplicatesLifecycleAtom,
  removeDuplicatesLifecycleStateAtom,
  removeDuplicatesOpenAtom,
  removeDuplicatesSessionAtom,
} from './state'
import type { RemoveDuplicatesMutationTicket } from './state'
import type { RemoveDuplicatesMutationOutcome, RemoveDuplicatesSessionSnapshot } from './types'

export function mutationTicketIsCurrent(
  get: Getter,
  ticket: RemoveDuplicatesMutationTicket,
): boolean {
  const lifecycle = get(removeDuplicatesLifecycleAtom)
  const active = get(activeRemoveDuplicatesMutationAtom)
  return (
    active === ticket &&
    get(removeDuplicatesOpenAtom) &&
    get(removeDuplicatesSessionAtom)?.sessionId === ticket.sessionId &&
    lifecycle.sessionId === ticket.sessionId &&
    lifecycle.mutationRequestId === ticket.target.requestId
  )
}

export function sessionAuthorityIsCurrent(
  get: Getter,
  session: RemoveDuplicatesSessionSnapshot,
): boolean {
  const selectionRange = get(selectionRangeAtom)
  return (
    get(selectionAuthorityWitnessAtom) === session.selectionWitness &&
    get(workspaceActiveSheetAuthorityWitnessAtom) === session.workspaceActiveSheetWitness &&
    get(primarySelectionRegionAtom).sheetId === session.sheetId &&
    get(workspaceSessionAtom).activeSheetId === session.sheetId &&
    selectionRange.rowStart === session.range.startRow &&
    selectionRange.rowEnd === session.range.endRow &&
    selectionRange.colStart === session.range.startCol &&
    selectionRange.colEnd === session.range.endCol
  )
}

export function mutationTicketAuthorityIsCurrent(
  get: Getter,
  ticket: RemoveDuplicatesMutationTicket,
): boolean {
  return (
    get(selectionAuthorityWitnessAtom) === ticket.selectionWitness &&
    get(workspaceActiveSheetAuthorityWitnessAtom) === ticket.workspaceActiveSheetWitness &&
    get(primarySelectionRegionAtom).sheetId === ticket.target.sheetId &&
    get(workspaceSessionAtom).activeSheetId === ticket.target.sheetId
  )
}

export function markMutationStaleBeforeTransport(
  get: Getter,
  set: Setter,
  ticket: RemoveDuplicatesMutationTicket,
  readRequestId: ProjectionRequestId | null,
): RemoveDuplicatesMutationOutcome {
  if (!set(releaseHistoryProducerReservationAtom, ticket.historyReservation))
    return markOutcomeUnknown(
      set,
      ticket,
      'History ownership could not be reconciled before transport.',
    )
  if (!mutationTicketIsCurrent(get, ticket)) return 'stale'
  set(removeDuplicatesErrorStateAtom, REMOVE_DUPLICATES_READ_STALE_ERROR)
  set(
    removeDuplicatesLifecycleStateAtom,
    lifecycleFor('read-stale', ticket.sessionId, ticket.target.sheetId, readRequestId),
  )
  set(activeRemoveDuplicatesMutationAtom, null)
  return 'stale'
}

export function markOutcomeUnknown(
  set: Setter,
  ticket: RemoveDuplicatesMutationTicket,
  detail = '',
): RemoveDuplicatesMutationOutcome {
  set(
    removeDuplicatesErrorStateAtom,
    `${REMOVE_DUPLICATES_OUTCOME_UNKNOWN_ERROR}${detail.length > 0 ? ` ${detail}` : ''}`,
  )
  set(
    removeDuplicatesLifecycleStateAtom,
    lifecycleFor(
      'outcome-unknown',
      ticket.sessionId,
      ticket.target.sheetId,
      null,
      ticket.target.requestId,
    ),
  )
  return 'outcome-unknown'
}

export async function refreshAcknowledgedMutation(
  get: Getter,
  set: Setter,
  ticket: RemoveDuplicatesMutationTicket,
): Promise<RemoveDuplicatesMutationOutcome> {
  if (!mutationTicketIsCurrent(get, ticket)) return 'stale'
  if (!mutationTicketAuthorityIsCurrent(get, ticket)) return markOutcomeUnknown(set, ticket)
  set(removeDuplicatesErrorStateAtom, '')
  set(
    removeDuplicatesLifecycleStateAtom,
    lifecycleFor(
      'refreshing',
      ticket.sessionId,
      ticket.target.sheetId,
      null,
      ticket.target.requestId,
    ),
  )
  await Promise.resolve()
  if (!mutationTicketIsCurrent(get, ticket)) return 'stale'
  if (!mutationTicketAuthorityIsCurrent(get, ticket)) return markOutcomeUnknown(set, ticket)
  set(removeDuplicatesLifecycleStateAtom, get(removeDuplicatesLifecycleAtom))
  try {
    await withRemoveDuplicatesTimeout(
      Reflect.apply(ticket.refreshProjection, undefined, [ticket.target.sheetId]),
      ticket.timeoutMs,
      'Remove Duplicates refresh',
    )
  } catch (error) {
    const detail = errorMessage(error)
    if (!mutationTicketIsCurrent(get, ticket)) return 'stale'
    if (!mutationTicketAuthorityIsCurrent(get, ticket)) return markOutcomeUnknown(set, ticket)
    set(removeDuplicatesErrorStateAtom, `${REMOVE_DUPLICATES_REFRESH_ERROR_PREFIX}${detail}`)
    set(
      removeDuplicatesLifecycleStateAtom,
      lifecycleFor(
        'refresh-failed',
        ticket.sessionId,
        ticket.target.sheetId,
        null,
        ticket.target.requestId,
      ),
    )
    return 'refresh-failed'
  }
  if (!mutationTicketIsCurrent(get, ticket)) return 'stale'
  if (!mutationTicketAuthorityIsCurrent(get, ticket)) return markOutcomeUnknown(set, ticket)
  if (!set(releaseHistoryProducerReservationAtom, ticket.historyReservation))
    return markOutcomeUnknown(
      set,
      ticket,
      'History ownership could not be reconciled after refresh.',
    )
  if (!mutationTicketIsCurrent(get, ticket)) return 'stale'
  if (!mutationTicketAuthorityIsCurrent(get, ticket)) return markOutcomeUnknown(set, ticket)
  closeSession(get, set)
  return 'completed'
}
