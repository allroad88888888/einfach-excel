import { atom } from '@einfach/core'
import type { Getter, Setter } from '@einfach/core'
import type { MutationPreparation, PendingMutation, RefreshRecoveryInternal } from './internal-types'
import { settleAttempt, removeAttempt } from './ledger-domain'
import { setCommandError, synchronizeFindReplaceTarget } from './lifecycle-domain'
import { copyReplaceRequest, currentMutationMatches, markMutationUnknown, prepareMutation, settleLateExactAcknowledgement, validateAcknowledgement, validateNotAppliedResult } from './mutation-domain'
import { continueRefreshRecovery, requireRefreshRecovery } from './refresh-recovery'
import { findReplaceCommandErrorStateAtom, findReplaceOperationAttemptLedgerStateAtom, findReplaceSessionStateAtom, replaceAllCappedStateAtom } from './state'
import { ticketInputsCurrent } from './target-domain'
import { error, normalizeError, normalizeTimeoutMs, waitForTransport } from './value-domain'
import type { ReplaceMatchesResponse, RunFindReplaceMutationInput, RunFindReplaceRefreshRecoveryInput } from './types'

async function executeMutation(get: Getter, set: Setter, preparation: MutationPreparation): Promise<void> {
  const originalTicket = preparation.ticket
  await Promise.resolve()
  if (!currentMutationMatches(get, originalTicket)) return
  const dispatchedTicket: PendingMutation = { ...originalTicket, dispatched: true }
  set(findReplaceSessionStateAtom, (session) => ({ ...session, pendingMutation: dispatchedTicket }))
  let promise: Promise<ReplaceMatchesResponse>
  try { promise = Promise.resolve(preparation.replaceMatches(copyReplaceRequest(dispatchedTicket.request))) } catch (transportError) { markMutationUnknown(get, set, dispatchedTicket, normalizeError(transportError)); return }
  const outcome = await waitForTransport(promise, preparation.timeoutMs)
  if (outcome.kind === 'timeout') {
    markMutationUnknown(get, set, dispatchedTicket, error('FIND_REPLACE_OUTCOME_UNKNOWN', 'Replace timed out after dispatch; automatic resend is blocked', 'transport'))
    void promise.then((lateValue) => settleLateExactAcknowledgement(get, set, dispatchedTicket, lateValue, preparation.acceptAcknowledgedResult === undefined ? 'search' : 'projection'), () => undefined)
    return
  }
  if (outcome.kind === 'rejected') { markMutationUnknown(get, set, dispatchedTicket, error('FIND_REPLACE_OUTCOME_UNKNOWN', 'Replace rejected after dispatch without exact not-applied evidence', 'transport')); return }
  const notApplied = validateNotAppliedResult(outcome.value, dispatchedTicket.requestId)
  if (notApplied !== null) {
    set(findReplaceOperationAttemptLedgerStateAtom, (ledger) => removeAttempt(ledger, dispatchedTicket.operationId))
    const session = get(findReplaceSessionStateAtom)
    if (session.pendingMutation?.operationId === dispatchedTicket.operationId) { set(findReplaceSessionStateAtom, { ...session, pendingMutation: null }); setCommandError(set, { ...notApplied.error }) }
    return
  }
  const acknowledgement = validateAcknowledgement(outcome.value, dispatchedTicket)
  if (acknowledgement === null) { markMutationUnknown(get, set, dispatchedTicket, error('FIND_REPLACE_OUTCOME_UNKNOWN', 'Replace returned a malformed or wrongly correlated acknowledgement', 'transport')); return }
  const session = get(findReplaceSessionStateAtom)
  if (session.pendingMutation?.operationId !== dispatchedTicket.operationId || !ticketInputsCurrent(get, dispatchedTicket.resultTicket.search)) {
    if (session.pendingMutation?.operationId === dispatchedTicket.operationId) { set(findReplaceOperationAttemptLedgerStateAtom, (ledger) => settleAttempt(ledger, dispatchedTicket.operationId, 'outcome-unknown')); set(findReplaceSessionStateAtom, { ...session, pendingMutation: null }) }
    return
  }
  set(findReplaceOperationAttemptLedgerStateAtom, (ledger) => settleAttempt(ledger, dispatchedTicket.operationId, 'acknowledged'))
  const recovery: RefreshRecoveryInternal = { kind: 'acknowledged', status: 'refreshing', operationId: dispatchedTicket.operationId, phase: preparation.acceptAcknowledgedResult === undefined ? 'search' : 'projection', mutationRequest: Object.freeze(copyReplaceRequest(dispatchedTicket.request)), mutationResult: Object.freeze({ ...acknowledgement }), sourceSearch: dispatchedTicket.resultTicket.search, error: null }
  set(findReplaceSessionStateAtom, { ...session, pendingMutation: null, resultTicket: null, recovery })
  if (dispatchedTicket.action === 'replace-all' && dispatchedTicket.requestedCount < dispatchedTicket.resultTicket.totalCount) set(replaceAllCappedStateAtom, { acknowledgedProjectionCount: acknowledgement.replacedCount, totalCount: dispatchedTicket.resultTicket.totalCount })
  await continueRefreshRecovery(get, set, recovery, { searchRange: preparation.searchRange, acceptAcknowledgedResult: preparation.acceptAcknowledgedResult, timeoutMs: preparation.timeoutMs })
}

export const runFindReplaceMutationAtom = atom(null, (get, set, input: RunFindReplaceMutationInput): Promise<void> | void => {
  const preparation = prepareMutation(get, set, input)
  if (preparation === null) return
  return executeMutation(get, set, preparation)
})
runFindReplaceMutationAtom.debugLabel = 'spreadsheet.findReplace.runMutation'

export const runFindReplaceRefreshRecoveryAtom = atom(null, (get, set, input: RunFindReplaceRefreshRecoveryInput): Promise<void> | void => {
  if (synchronizeFindReplaceTarget(get, set)) return
  const session = get(findReplaceSessionStateAtom)
  const recovery = session.recovery
  if (recovery === null || recovery.status !== 'required') return
  if (typeof input.searchRange !== 'function') { requireRefreshRecovery(get, set, recovery, recovery.phase, error('FIND_REPLACE_SEARCH_UNAVAILABLE', 'Refresh recovery requires the search backend port', 'validation')); return }
  const refreshing: RefreshRecoveryInternal = { ...recovery, status: 'refreshing', error: null }
  set(findReplaceCommandErrorStateAtom, null)
  set(findReplaceSessionStateAtom, { ...session, recovery: refreshing })
  return continueRefreshRecovery(get, set, refreshing, { searchRange: input.searchRange, acceptAcknowledgedResult: input.acceptAcknowledgedResult, timeoutMs: normalizeTimeoutMs(input.timeoutMs) })
})
runFindReplaceRefreshRecoveryAtom.debugLabel = 'spreadsheet.findReplace.runRefreshRecovery'
