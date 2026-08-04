import type { Getter, Setter } from '@einfach/core'
import { MAX_OPERATION_LEDGER_ENTRIES } from './constants'
import type { FindReplaceOperationAttempt, FindReplaceReconciliationTarget, PendingMutation, SearchTicket } from './internal-types'
import { findReplaceOperationAttemptLedgerStateAtom, findReplaceRequestSequenceAtom } from './state'
import { copyRange, freezeQuery, nextFindReplaceSearchRequestId, sameQuery, sameRange } from './value-domain'

export function allocateRequestId(get: Getter, set: Setter): number | null {
  const requestId = nextFindReplaceSearchRequestId(get(findReplaceRequestSequenceAtom))
  if (requestId !== null) set(findReplaceRequestSequenceAtom, requestId)
  return requestId
}

export function settleAttempt(ledger: readonly FindReplaceOperationAttempt[], operationId: string, status: FindReplaceOperationAttempt['status']): FindReplaceOperationAttempt[] {
  return ledger.map((attempt) => attempt.operationId === operationId ? { ...attempt, status } : attempt)
}

export function reconciliationTarget(ticket: SearchTicket): FindReplaceReconciliationTarget {
  return { sheetId: ticket.request.sheetId, range: Object.freeze(copyRange(ticket.request.range)), query: freezeQuery(ticket.request.query) }
}

function sameReconciliationTarget(target: FindReplaceReconciliationTarget, ticket: SearchTicket): boolean {
  return target.sheetId === ticket.request.sheetId && sameRange(target.range, ticket.request.range) && sameQuery(target.query, ticket.request.query)
}

export function reconcileUnknownAttemptsForTarget(ledger: readonly FindReplaceOperationAttempt[], ticket: SearchTicket): FindReplaceOperationAttempt[] {
  return ledger.map((attempt) => attempt.status === 'outcome-unknown' && !attempt.reconciled && sameReconciliationTarget(attempt.target, ticket) ? { ...attempt, reconciled: true } : attempt)
}

export function attemptBlocksMutationForTarget(attempt: FindReplaceOperationAttempt, ticket: SearchTicket): boolean {
  return attempt.status === 'pending' || (attempt.status === 'outcome-unknown' && !attempt.reconciled && sameReconciliationTarget(attempt.target, ticket))
}

export function removeAttempt(ledger: readonly FindReplaceOperationAttempt[], operationId: string): FindReplaceOperationAttempt[] {
  return ledger.filter((attempt) => attempt.operationId !== operationId)
}

export function reserveAttempt(ledger: readonly FindReplaceOperationAttempt[], attempt: FindReplaceOperationAttempt): FindReplaceOperationAttempt[] | null {
  const compacted = [...ledger]
  while (compacted.length >= MAX_OPERATION_LEDGER_ENTRIES) {
    const evictableIndex = compacted.findIndex((entry) => entry.status === 'acknowledged' || entry.reconciled)
    if (evictableIndex < 0) return null
    compacted.splice(evictableIndex, 1)
  }
  compacted.push(attempt)
  return compacted
}

export function cancelPendingMutation(set: Setter, pending: PendingMutation | null): void {
  if (pending === null) return
  set(findReplaceOperationAttemptLedgerStateAtom, (ledger) => pending.dispatched ? settleAttempt(ledger, pending.operationId, 'outcome-unknown') : removeAttempt(ledger, pending.operationId))
}
