import type { Getter, Setter } from '@einfach/core'
import type { HistoryEntryRecorder } from '../history'
import type {
  FindReplaceOperationAttempt,
  MutationPreparation,
  PendingMutation,
} from './internal-types'
import { attemptBlocksMutationForTarget, reconciliationTarget, reserveAttempt } from './ledger-domain'
import { setCommandError, synchronizeFindReplaceTarget } from './lifecycle-domain'
import {
  findReplaceCommandErrorStateAtom,
  findReplaceFormStateAtom,
  findReplaceOperationAttemptLedgerStateAtom,
  findReplaceRequestSequenceAtom,
  findReplaceSessionStateAtom,
} from './state'
import { isResultTicketCurrent, publicCursor } from './target-domain'
import { error, normalizeTimeoutMs, planFindReplaceMutationIdentity } from './value-domain'
import type { ReplaceMatchesRequest, RunFindReplaceMutationInput } from './types'

const unavailableHistoryEntryRecorder: HistoryEntryRecorder = () => 'unavailable'

function captureHistoryEntryRecorder(input: RunFindReplaceMutationInput): HistoryEntryRecorder {
  try {
    if (typeof input.historyEntryRecorder === 'function') return input.historyEntryRecorder
  } catch {
    // Fall through to an unavailable capability rather than fabricate history.
  }
  return unavailableHistoryEntryRecorder
}

export function prepareMutation(
  get: Getter,
  set: Setter,
  input: RunFindReplaceMutationInput,
): MutationPreparation | null {
  if (synchronizeFindReplaceTarget(get, set)) return null
  const session = get(findReplaceSessionStateAtom)
  if (!session.open || session.pendingMutation !== null || session.activeSearchTicket !== null)
    return null
  if (session.recovery !== null) {
    setCommandError(
      set,
      session.recovery.kind === 'outcome-unknown'
        ? error(
            'FIND_REPLACE_OUTCOME_UNKNOWN',
            'Run a read-only reconciliation Find before replacing again',
            'transport',
          )
        : error(
            'FIND_REPLACE_REFRESH_RECOVERY_REQUIRED',
            'Finish the read-only refresh recovery before replacing again',
            'projection',
          ),
    )
    return null
  }
  if (input.action !== 'replace-current' && input.action !== 'replace-all') return null
  const historyEntryRecorder = captureHistoryEntryRecorder(input)
  if (typeof input.replaceMatches !== 'function') {
    setCommandError(
      set,
      error(
        'FIND_REPLACE_REPLACE_UNAVAILABLE',
        'The replace backend port is unavailable',
        'validation',
      ),
    )
    return null
  }
  if (typeof input.searchRange !== 'function') {
    setCommandError(
      set,
      error(
        'FIND_REPLACE_SEARCH_UNAVAILABLE',
        'Replace requires the refresh search port',
        'validation',
      ),
    )
    return null
  }
  const resultTicket = session.resultTicket
  const cursor = publicCursor(get)
  if (resultTicket === null || !isResultTicketCurrent(get, resultTicket)) {
    setCommandError(
      set,
      error(
        'FIND_REPLACE_TICKETED_RESULT_REQUIRED',
        'Replace requires a current Core-owned search result',
        'validation',
      ),
    )
    return null
  }
  if (
    get(findReplaceOperationAttemptLedgerStateAtom).some((attempt) =>
      attemptBlocksMutationForTarget(attempt, resultTicket.search),
    )
  ) {
    setCommandError(
      set,
      error(
        'FIND_REPLACE_OUTCOME_UNKNOWN',
        'A previous replace outcome for this target is unknown; automatic resend is blocked',
        'transport',
      ),
    )
    return null
  }
  if (cursor.status !== 'ready' || cursor.pageMatches.length === 0) {
    setCommandError(
      set,
      error('FIND_REPLACE_RESULT_REQUIRED', 'Replace requires a current match', 'validation'),
    )
    return null
  }
  if (resultTicket.revision === undefined) {
    setCommandError(
      set,
      error(
        'FIND_REPLACE_RESULT_REVISION_REQUIRED',
        'Replace requires a response-owned projection revision',
        'validation',
      ),
    )
    return null
  }
  if (input.revision !== undefined && input.revision !== resultTicket.revision) {
    setCommandError(
      set,
      error(
        'FIND_REPLACE_REVISION_MISMATCH',
        'The expected revision does not match the accepted search result',
        'validation',
      ),
    )
    return null
  }
  const selectedMatches =
    input.action === 'replace-all'
      ? resultTicket.matches
      : [resultTicket.matches[cursor.currentIndex] ?? resultTicket.matches[0]]
  if (selectedMatches.length === 0) return null
  if (selectedMatches.some((match) => match.target === null)) {
    setCommandError(
      set,
      error(
        'FIND_REPLACE_TARGET_PROVENANCE_REQUIRED',
        'Replace requires canonical display/formula target provenance',
        'validation',
      ),
    )
    return null
  }
  const plan = planFindReplaceMutationIdentity(get(findReplaceRequestSequenceAtom))
  if (plan === null) {
    setCommandError(
      set,
      error(
        'FIND_REPLACE_REQUEST_IDENTITY_UNAVAILABLE',
        'Find/replace request identity is exhausted',
        'validation',
      ),
    )
    return null
  }
  const attempt: FindReplaceOperationAttempt = {
    operationId: plan.operationId,
    requestedCount: selectedMatches.length,
    status: 'pending',
    reconciled: false,
    target: reconciliationTarget(resultTicket.search),
  }
  const nextLedger = reserveAttempt(get(findReplaceOperationAttemptLedgerStateAtom), attempt)
  if (nextLedger === null) {
    setCommandError(
      set,
      error(
        'FIND_REPLACE_LEDGER_FULL',
        'Replace evidence ledger is full; unresolved entries prevent dispatch',
        'transport',
      ),
    )
    return null
  }
  const request: ReplaceMatchesRequest = {
    kind: 'replace-matches',
    coords: selectedMatches.map((match) => ({
      sheetId: match.sheetId,
      coord: { ...match.coord },
      matchStart: match.matchStart,
      matchEnd: match.matchEnd,
      target: match.target!,
    })),
    replacement: get(findReplaceFormStateAtom).replacement,
    requestId: plan.requestId,
    revision: resultTicket.revision,
  }
  const ticket: PendingMutation = {
    operationId: plan.operationId,
    requestId: plan.requestId,
    action: input.action,
    requestedCount: selectedMatches.length,
    request: Object.freeze(request),
    resultTicket,
    historyEntryRecorder,
    dispatched: false,
  }
  set(findReplaceRequestSequenceAtom, plan.requestId)
  set(findReplaceOperationAttemptLedgerStateAtom, nextLedger)
  set(findReplaceCommandErrorStateAtom, null)
  set(findReplaceSessionStateAtom, { ...session, pendingMutation: ticket })
  return {
    ticket,
    replaceMatches: input.replaceMatches,
    searchRange: input.searchRange,
    acceptAcknowledgedResult: input.acceptAcknowledgedResult,
    timeoutMs: normalizeTimeoutMs(input.timeoutMs),
  }
}
