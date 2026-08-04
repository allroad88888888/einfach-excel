import type { Getter, Setter } from '@einfach/core'
import type { SpreadsheetError } from '../shared'
import type { RefreshPorts, RefreshRecoveryInternal } from './internal-types'
import { allocateRequestId } from './ledger-domain'
import { acceptSearchResult, setCommandError } from './lifecycle-domain'
import { copyReplaceRequest } from './mutation-domain'
import { validateSearchResult } from './search-validation'
import { findReplaceCursorStateAtom, findReplaceSessionStateAtom } from './state'
import { createSearchTicket, ticketInputsCurrent } from './target-domain'
import { error, normalizeError, waitForTransport } from './value-domain'
import type { SearchRangeRequest, SearchRangeResult } from './types'

export function requireRefreshRecovery(get: Getter, set: Setter, recovery: RefreshRecoveryInternal, phase: RefreshRecoveryInternal['phase'], value: SpreadsheetError): void {
  const session = get(findReplaceSessionStateAtom)
  if (session.recovery?.operationId !== recovery.operationId) return
  const requiredRecovery: RefreshRecoveryInternal = recovery.kind === 'outcome-unknown' ? { ...recovery, status: 'required', phase: 'search', error: value } : { ...recovery, status: 'required', phase, error: value }
  set(findReplaceSessionStateAtom, { ...session, activeSearchTicket: null, resultTicket: null, recovery: requiredRecovery })
  set(findReplaceCursorStateAtom, { status: 'error', currentIndex: 0, totalCount: 0, pageMatches: [], error: value })
  setCommandError(set, value)
}

export async function executeRefreshSearch(get: Getter, set: Setter, recovery: RefreshRecoveryInternal, ports: RefreshPorts): Promise<void> {
  const requestId = allocateRequestId(get, set)
  if (requestId === null) { requireRefreshRecovery(get, set, recovery, 'search', error('FIND_REPLACE_REQUEST_IDENTITY_UNAVAILABLE', 'Refresh search request identity is exhausted', 'validation')); return }
  const ticket = createSearchTicket(get, requestId, recovery.sourceSearch.request.query, recovery.sourceSearch.request.range, recovery.kind === 'acknowledged' ? recovery.mutationResult.revision : undefined)
  const searching: RefreshRecoveryInternal = { ...recovery, status: 'refreshing', phase: 'search', error: null }
  set(findReplaceCursorStateAtom, { status: 'searching', currentIndex: 0, totalCount: 0, pageMatches: [] })
  set(findReplaceSessionStateAtom, (session) => ({ ...session, activeSearchTicket: ticket, cursorOwnerTicket: ticket, compatibilityCursor: false, recovery: searching }))
  await Promise.resolve()
  if (get(findReplaceSessionStateAtom).activeSearchTicket !== ticket || !ticketInputsCurrent(get, ticket)) return
  let promise: Promise<SearchRangeResult>
  try { promise = Promise.resolve(ports.searchRange(ticket.request as SearchRangeRequest)) } catch (transportError) { requireRefreshRecovery(get, set, searching, 'search', normalizeError(transportError)); return }
  const outcome = await waitForTransport(promise, ports.timeoutMs)
  if (get(findReplaceSessionStateAtom).activeSearchTicket !== ticket || !ticketInputsCurrent(get, ticket)) return
  if (outcome.kind === 'timeout') { requireRefreshRecovery(get, set, searching, 'search', error('FIND_REPLACE_TIMEOUT', 'Refresh search timed out', 'transport')); return }
  if (outcome.kind === 'rejected') { requireRefreshRecovery(get, set, searching, 'search', normalizeError(outcome.error)); return }
  const accepted = validateSearchResult(outcome.value, ticket)
  if (accepted === null) { requireRefreshRecovery(get, set, searching, 'search', error('FIND_REPLACE_PROTOCOL_ERROR', 'Refresh search failed exact correlation', 'transport')); return }
  acceptSearchResult(set, ticket, accepted, false)
}

export async function continueRefreshRecovery(get: Getter, set: Setter, recovery: RefreshRecoveryInternal, ports: RefreshPorts): Promise<void> {
  if (get(findReplaceSessionStateAtom).recovery?.operationId !== recovery.operationId || !ticketInputsCurrent(get, recovery.sourceSearch)) return
  let searchRecovery = recovery
  if (recovery.kind === 'acknowledged' && recovery.phase === 'projection') {
    if (typeof ports.acceptAcknowledgedResult !== 'function') { requireRefreshRecovery(get, set, recovery, 'projection', error('FIND_REPLACE_PROJECTION_REFRESH_UNAVAILABLE', 'Projection refresh acceptance is unavailable', 'projection')); return }
    let promise: Promise<void>
    try { promise = Promise.resolve(ports.acceptAcknowledgedResult({ ...recovery.mutationResult }, copyReplaceRequest(recovery.mutationRequest))) } catch (projectionError) { requireRefreshRecovery(get, set, recovery, 'projection', normalizeError(projectionError)); return }
    const outcome = await waitForTransport(promise, ports.timeoutMs)
    if (get(findReplaceSessionStateAtom).recovery?.operationId !== recovery.operationId || !ticketInputsCurrent(get, recovery.sourceSearch)) return
    if (outcome.kind === 'timeout') { requireRefreshRecovery(get, set, recovery, 'projection', error('FIND_REPLACE_CALLBACK_TIMEOUT', 'Projection refresh acceptance timed out', 'projection')); return }
    if (outcome.kind === 'rejected') { requireRefreshRecovery(get, set, recovery, 'projection', normalizeError(outcome.error)); return }
    searchRecovery = { ...recovery, phase: 'search', status: 'refreshing', error: null }
    set(findReplaceSessionStateAtom, (session) => ({ ...session, recovery: searchRecovery }))
  }
  await executeRefreshSearch(get, set, searchRecovery, ports)
}
