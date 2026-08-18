import type { Getter, Setter } from '@einfach/core'
import type { SpreadsheetError } from '../shared'
import type { PendingMutation, RefreshRecoveryInternal } from './internal-types'
import { settleAttempt } from './ledger-domain'
import { setCommandError } from './lifecycle-domain'
import {
  findReplaceCursorStateAtom,
  findReplaceOperationAttemptLedgerStateAtom,
  findReplaceSessionStateAtom,
} from './state'
import { ticketInputsCurrent } from './target-domain'
import { error, isProjectionRevision, isRecord, isSafeIndex, normalizeError } from './value-domain'
import type {
  ReplaceMatchesNotAppliedResult,
  ReplaceMatchesRequest,
  ReplaceMatchesResponse,
  ReplaceMatchesResult,
} from './types'

export function validateNotAppliedResult(
  value: unknown,
  requestId: number,
): ReplaceMatchesNotAppliedResult | null {
  if (
    !isRecord(value) ||
    value.kind !== 'replace-matches-not-applied' ||
    value.applied !== false ||
    value.requestId !== requestId ||
    !isRecord(value.error) ||
    typeof value.error.code !== 'string' ||
    typeof value.error.message !== 'string'
  )
    return null
  return {
    kind: 'replace-matches-not-applied',
    applied: false,
    requestId,
    error: normalizeError(value.error),
  }
}

export function validateAcknowledgement(
  value: unknown,
  ticket: PendingMutation,
): ReplaceMatchesResult | null {
  if (
    !isRecord(value) ||
    value.requestId !== ticket.requestId ||
    !isSafeIndex(value.replacedCount) ||
    value.replacedCount > ticket.requestedCount ||
    !isProjectionRevision(value.revision)
  )
    return null
  return {
    requestId: ticket.requestId,
    replacedCount: value.replacedCount,
    revision: value.revision,
  }
}

export function currentMutationMatches(get: Getter, ticket: PendingMutation): boolean {
  return (
    get(findReplaceSessionStateAtom).pendingMutation?.operationId === ticket.operationId &&
    ticketInputsCurrent(get, ticket.resultTicket.search)
  )
}

export function copyReplaceRequest(request: ReplaceMatchesRequest): ReplaceMatchesRequest {
  return {
    ...request,
    coords: request.coords.map((entry) => ({ ...entry, coord: { ...entry.coord } })),
  }
}

export function markMutationUnknown(
  get: Getter,
  set: Setter,
  ticket: PendingMutation,
  value: SpreadsheetError,
): void {
  set(findReplaceOperationAttemptLedgerStateAtom, (ledger) =>
    settleAttempt(ledger, ticket.operationId, 'outcome-unknown'),
  )
  const session = get(findReplaceSessionStateAtom)
  if (session.pendingMutation?.operationId !== ticket.operationId) return
  if (!ticketInputsCurrent(get, ticket.resultTicket.search)) {
    set(findReplaceSessionStateAtom, { ...session, pendingMutation: null })
    return
  }
  const recovery: RefreshRecoveryInternal = {
    kind: 'outcome-unknown',
    status: 'required',
    operationId: ticket.operationId,
    phase: 'search',
    mutationRequest: Object.freeze(copyReplaceRequest(ticket.request)),
    mutationResult: null,
    sourceSearch: ticket.resultTicket.search,
    error: value,
  }
  set(findReplaceSessionStateAtom, {
    ...session,
    pendingMutation: null,
    resultTicket: null,
    recovery,
  })
  set(findReplaceCursorStateAtom, {
    status: 'error',
    currentIndex: 0,
    totalCount: 0,
    pageMatches: [],
    error: value,
  })
  setCommandError(set, value)
}

export function settleLateExactAcknowledgement(
  get: Getter,
  set: Setter,
  ticket: PendingMutation,
  value: ReplaceMatchesResponse,
  phase: 'search' | 'projection',
): void {
  const acknowledgement = validateAcknowledgement(value, ticket)
  if (acknowledgement === null) return
  const session = get(findReplaceSessionStateAtom)
  const attempt = get(findReplaceOperationAttemptLedgerStateAtom).find(
    (entry) => entry.operationId === ticket.operationId,
  )
  if (
    attempt?.status !== 'outcome-unknown' ||
    attempt.reconciled ||
    session.pendingMutation !== null ||
    session.activeSearchTicket !== null ||
    session.recovery?.kind !== 'outcome-unknown' ||
    session.recovery.operationId !== ticket.operationId ||
    session.recovery.status !== 'required' ||
    !ticketInputsCurrent(get, ticket.resultTicket.search)
  )
    return
  const recoveryError = error(
    'FIND_REPLACE_LATE_ACK_REFRESH_REQUIRED',
    'Replace was acknowledged after timeout; explicit refresh recovery is required',
    'projection',
  )
  const recovery: RefreshRecoveryInternal = {
    kind: 'acknowledged',
    status: 'required',
    operationId: ticket.operationId,
    phase,
    mutationRequest: Object.freeze(copyReplaceRequest(ticket.request)),
    mutationResult: Object.freeze({ ...acknowledgement }),
    sourceSearch: ticket.resultTicket.search,
    error: recoveryError,
  }
  set(findReplaceOperationAttemptLedgerStateAtom, (ledger) =>
    settleAttempt(ledger, ticket.operationId, 'acknowledged'),
  )
  set(findReplaceSessionStateAtom, { ...session, resultTicket: null, recovery })
  set(findReplaceCursorStateAtom, {
    status: 'error',
    currentIndex: 0,
    totalCount: 0,
    pageMatches: [],
    error: recoveryError,
  })
  setCommandError(set, recoveryError)
}
