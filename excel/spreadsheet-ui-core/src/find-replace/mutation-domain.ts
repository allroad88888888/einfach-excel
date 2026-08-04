import type { Getter, Setter } from '@einfach/core'
import type { SpreadsheetError } from '../shared'
import type { FindReplaceOperationAttempt, MutationPreparation, PendingMutation, RefreshRecoveryInternal } from './internal-types'
import { attemptBlocksMutationForTarget, reconciliationTarget, reserveAttempt, settleAttempt } from './ledger-domain'
import { setCommandError, synchronizeFindReplaceTarget } from './lifecycle-domain'
import { findReplaceCommandErrorStateAtom, findReplaceCursorStateAtom, findReplaceFormStateAtom, findReplaceOperationAttemptLedgerStateAtom, findReplaceRequestSequenceAtom, findReplaceSessionStateAtom } from './state'
import { isResultTicketCurrent, publicCursor, ticketInputsCurrent } from './target-domain'
import { error, isProjectionRevision, isRecord, isSafeIndex, normalizeError, normalizeTimeoutMs, planFindReplaceMutationIdentity } from './value-domain'
import type { ReplaceMatchesNotAppliedResult, ReplaceMatchesRequest, ReplaceMatchesResponse, ReplaceMatchesResult, RunFindReplaceMutationInput } from './types'

export function validateNotAppliedResult(value: unknown, requestId: number): ReplaceMatchesNotAppliedResult | null {
  if (!isRecord(value) || value.kind !== 'replace-matches-not-applied' || value.applied !== false || value.requestId !== requestId || !isRecord(value.error) || typeof value.error.code !== 'string' || typeof value.error.message !== 'string') return null
  return { kind: 'replace-matches-not-applied', applied: false, requestId, error: normalizeError(value.error) }
}

export function validateAcknowledgement(value: unknown, ticket: PendingMutation): ReplaceMatchesResult | null {
  if (!isRecord(value) || value.requestId !== ticket.requestId || !isSafeIndex(value.replacedCount) || value.replacedCount > ticket.requestedCount || !isProjectionRevision(value.revision)) return null
  return { requestId: ticket.requestId, replacedCount: value.replacedCount, revision: value.revision }
}

export function currentMutationMatches(get: Getter, ticket: PendingMutation): boolean {
  return get(findReplaceSessionStateAtom).pendingMutation?.operationId === ticket.operationId && ticketInputsCurrent(get, ticket.resultTicket.search)
}

export function prepareMutation(get: Getter, set: Setter, input: RunFindReplaceMutationInput): MutationPreparation | null {
  if (synchronizeFindReplaceTarget(get, set)) return null
  const session = get(findReplaceSessionStateAtom)
  if (!session.open || session.pendingMutation !== null || session.activeSearchTicket !== null) return null
  if (session.recovery !== null) {
    setCommandError(set, session.recovery.kind === 'outcome-unknown' ? error('FIND_REPLACE_OUTCOME_UNKNOWN', 'Run a read-only reconciliation Find before replacing again', 'transport') : error('FIND_REPLACE_REFRESH_RECOVERY_REQUIRED', 'Finish the read-only refresh recovery before replacing again', 'projection'))
    return null
  }
  if (input.action !== 'replace-current' && input.action !== 'replace-all') return null
  if (typeof input.replaceMatches !== 'function') { setCommandError(set, error('FIND_REPLACE_REPLACE_UNAVAILABLE', 'The replace backend port is unavailable', 'validation')); return null }
  if (typeof input.searchRange !== 'function') { setCommandError(set, error('FIND_REPLACE_SEARCH_UNAVAILABLE', 'Replace requires the refresh search port', 'validation')); return null }
  const resultTicket = session.resultTicket
  const cursor = publicCursor(get)
  if (resultTicket === null || !isResultTicketCurrent(get, resultTicket)) { setCommandError(set, error('FIND_REPLACE_TICKETED_RESULT_REQUIRED', 'Replace requires a current Core-owned search result', 'validation')); return null }
  if (get(findReplaceOperationAttemptLedgerStateAtom).some((attempt) => attemptBlocksMutationForTarget(attempt, resultTicket.search))) { setCommandError(set, error('FIND_REPLACE_OUTCOME_UNKNOWN', 'A previous replace outcome for this target is unknown; automatic resend is blocked', 'transport')); return null }
  if (cursor.status !== 'ready' || cursor.pageMatches.length === 0) { setCommandError(set, error('FIND_REPLACE_RESULT_REQUIRED', 'Replace requires a current match', 'validation')); return null }
  if (resultTicket.revision === undefined) { setCommandError(set, error('FIND_REPLACE_RESULT_REVISION_REQUIRED', 'Replace requires a response-owned projection revision', 'validation')); return null }
  if (input.revision !== undefined && input.revision !== resultTicket.revision) { setCommandError(set, error('FIND_REPLACE_REVISION_MISMATCH', 'The expected revision does not match the accepted search result', 'validation')); return null }
  const selectedMatches = input.action === 'replace-all' ? resultTicket.matches : [resultTicket.matches[cursor.currentIndex] ?? resultTicket.matches[0]]
  if (selectedMatches.length === 0) return null
  if (selectedMatches.some((match) => match.target === null)) { setCommandError(set, error('FIND_REPLACE_TARGET_PROVENANCE_REQUIRED', 'Replace requires canonical display/formula target provenance', 'validation')); return null }
  const plan = planFindReplaceMutationIdentity(get(findReplaceRequestSequenceAtom))
  if (plan === null) { setCommandError(set, error('FIND_REPLACE_REQUEST_IDENTITY_UNAVAILABLE', 'Find/replace request identity is exhausted', 'validation')); return null }
  const attempt: FindReplaceOperationAttempt = { operationId: plan.operationId, requestedCount: selectedMatches.length, status: 'pending', reconciled: false, target: reconciliationTarget(resultTicket.search) }
  const nextLedger = reserveAttempt(get(findReplaceOperationAttemptLedgerStateAtom), attempt)
  if (nextLedger === null) { setCommandError(set, error('FIND_REPLACE_LEDGER_FULL', 'Replace evidence ledger is full; unresolved entries prevent dispatch', 'transport')); return null }
  const request: ReplaceMatchesRequest = { kind: 'replace-matches', coords: selectedMatches.map((match) => ({ sheetId: match.sheetId, coord: { ...match.coord }, matchStart: match.matchStart, matchEnd: match.matchEnd, target: match.target! })), replacement: get(findReplaceFormStateAtom).replacement, requestId: plan.requestId, revision: resultTicket.revision }
  const ticket: PendingMutation = { operationId: plan.operationId, requestId: plan.requestId, action: input.action, requestedCount: selectedMatches.length, request: Object.freeze(request), resultTicket, dispatched: false }
  set(findReplaceRequestSequenceAtom, plan.requestId)
  set(findReplaceOperationAttemptLedgerStateAtom, nextLedger)
  set(findReplaceCommandErrorStateAtom, null)
  set(findReplaceSessionStateAtom, { ...session, pendingMutation: ticket })
  return { ticket, replaceMatches: input.replaceMatches, searchRange: input.searchRange, acceptAcknowledgedResult: input.acceptAcknowledgedResult, timeoutMs: normalizeTimeoutMs(input.timeoutMs) }
}

export function copyReplaceRequest(request: ReplaceMatchesRequest): ReplaceMatchesRequest {
  return { ...request, coords: request.coords.map((entry) => ({ ...entry, coord: { ...entry.coord } })) }
}

export function markMutationUnknown(get: Getter, set: Setter, ticket: PendingMutation, value: SpreadsheetError): void {
  set(findReplaceOperationAttemptLedgerStateAtom, (ledger) => settleAttempt(ledger, ticket.operationId, 'outcome-unknown'))
  const session = get(findReplaceSessionStateAtom)
  if (session.pendingMutation?.operationId !== ticket.operationId) return
  if (!ticketInputsCurrent(get, ticket.resultTicket.search)) { set(findReplaceSessionStateAtom, { ...session, pendingMutation: null }); return }
  const recovery: RefreshRecoveryInternal = { kind: 'outcome-unknown', status: 'required', operationId: ticket.operationId, phase: 'search', mutationRequest: Object.freeze(copyReplaceRequest(ticket.request)), mutationResult: null, sourceSearch: ticket.resultTicket.search, error: value }
  set(findReplaceSessionStateAtom, { ...session, pendingMutation: null, resultTicket: null, recovery })
  set(findReplaceCursorStateAtom, { status: 'error', currentIndex: 0, totalCount: 0, pageMatches: [], error: value })
  setCommandError(set, value)
}

export function settleLateExactAcknowledgement(get: Getter, set: Setter, ticket: PendingMutation, value: ReplaceMatchesResponse, phase: 'search' | 'projection'): void {
  const acknowledgement = validateAcknowledgement(value, ticket)
  if (acknowledgement === null) return
  const session = get(findReplaceSessionStateAtom)
  const attempt = get(findReplaceOperationAttemptLedgerStateAtom).find((entry) => entry.operationId === ticket.operationId)
  if (attempt?.status !== 'outcome-unknown' || attempt.reconciled || session.pendingMutation !== null || session.activeSearchTicket !== null || session.recovery?.kind !== 'outcome-unknown' || session.recovery.operationId !== ticket.operationId || session.recovery.status !== 'required' || !ticketInputsCurrent(get, ticket.resultTicket.search)) return
  const recoveryError = error('FIND_REPLACE_LATE_ACK_REFRESH_REQUIRED', 'Replace was acknowledged after timeout; explicit refresh recovery is required', 'projection')
  const recovery: RefreshRecoveryInternal = { kind: 'acknowledged', status: 'required', operationId: ticket.operationId, phase, mutationRequest: Object.freeze(copyReplaceRequest(ticket.request)), mutationResult: Object.freeze({ ...acknowledgement }), sourceSearch: ticket.resultTicket.search, error: recoveryError }
  set(findReplaceOperationAttemptLedgerStateAtom, (ledger) => settleAttempt(ledger, ticket.operationId, 'acknowledged'))
  set(findReplaceSessionStateAtom, { ...session, resultTicket: null, recovery })
  set(findReplaceCursorStateAtom, { status: 'error', currentIndex: 0, totalCount: 0, pageMatches: [], error: recoveryError })
  setCommandError(set, recoveryError)
}
