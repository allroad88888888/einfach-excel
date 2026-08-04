import { atom } from '@einfach/core'
import type { Atom } from '@einfach/core'
import type { SpreadsheetError } from '../shared'
import type { FindCursorState, FindReplaceCapabilityProjection, FindReplaceLifecycleState, FindReplaceOperationDiagnostics, FindReplaceQuery, FindReplaceRefreshRecoveryState, ReplaceAllCapInfo } from './types'
import { INITIAL_REFRESH_RECOVERY } from './constants'
import { attemptBlocksMutationForTarget } from './ledger-domain'
import { findReplaceCapabilityStateAtom, findReplaceCommandErrorStateAtom, findReplaceFormStateAtom, findReplaceOperationAttemptLedgerStateAtom, findReplaceQueryStateAtom, findReplaceSessionStateAtom, replaceAllCappedStateAtom } from './state'
import { isResultTicketCurrent, publicCursor, ticketInputsCurrent } from './target-domain'
import { freezeCursor, freezeQuery, queryFromForm } from './value-domain'

export const findReplaceQueryAtom: Atom<Readonly<FindReplaceQuery> | null> = atom((get) => {
  const query = get(findReplaceQueryStateAtom)
  return query === null ? null : freezeQuery(query)
})
findReplaceQueryAtom.debugLabel = 'spreadsheet.findReplace.query'

export const findReplaceCursorAtom: Atom<Readonly<FindCursorState>> = atom((get) => freezeCursor(publicCursor(get)))
findReplaceCursorAtom.debugLabel = 'spreadsheet.findReplace.cursor'

export const findReplaceFormAtom = atom((get) => Object.freeze({ ...get(findReplaceFormStateAtom) }))
findReplaceFormAtom.debugLabel = 'spreadsheet.findReplace.form'

export const findReplaceSessionAtom: Atom<Readonly<FindReplaceLifecycleState>> = atom((get) => {
  const session = get(findReplaceSessionStateAtom)
  return Object.freeze({ open: session.open, sessionId: session.sessionId, searchPending: session.activeSearchTicket !== null, mutationPending: session.pendingMutation !== null, refreshPending: session.recovery?.status === 'refreshing', refreshRecoveryRequired: session.recovery?.status === 'required', hasTicketedResult: session.resultTicket !== null && isResultTicketCurrent(get, session.resultTicket) })
})
findReplaceSessionAtom.debugLabel = 'spreadsheet.findReplace.session'

export const findReplaceCapabilityProjectionAtom: Atom<Readonly<FindReplaceCapabilityProjection>> = atom((get) => {
  const capability = get(findReplaceCapabilityStateAtom)
  return Object.freeze({ capability, findEnabled: capability === 'find-only' || capability === 'find-and-replace', replaceEnabled: capability === 'find-and-replace' })
})
findReplaceCapabilityProjectionAtom.debugLabel = 'spreadsheet.findReplace.capabilityProjection'

export const findReplaceRefreshRecoveryAtom: Atom<Readonly<FindReplaceRefreshRecoveryState>> = atom((get) => {
  const recovery = get(findReplaceSessionStateAtom).recovery
  if (recovery === null || !ticketInputsCurrent(get, recovery.sourceSearch)) return INITIAL_REFRESH_RECOVERY
  return Object.freeze({ status: recovery.status, operationId: recovery.operationId, phase: recovery.phase, ...(recovery.error === null ? {} : { error: Object.freeze({ ...recovery.error }) }) })
})
findReplaceRefreshRecoveryAtom.debugLabel = 'spreadsheet.findReplace.refreshRecovery'

export const findReplaceOperationDiagnosticsAtom: Atom<Readonly<FindReplaceOperationDiagnostics>> = atom((get) => {
  const entries = get(findReplaceOperationAttemptLedgerStateAtom).map((attempt) => Object.freeze({ operationId: attempt.operationId, requestedCount: attempt.requestedCount, status: attempt.status, reconciled: attempt.reconciled }))
  return Object.freeze({ count: entries.length, pendingCount: entries.filter((entry) => entry.status === 'pending').length, acknowledgedCount: entries.filter((entry) => entry.status === 'acknowledged').length, outcomeUnknownCount: entries.filter((entry) => entry.status === 'outcome-unknown').length, unreconciledOutcomeUnknownCount: entries.filter((entry) => entry.status === 'outcome-unknown' && !entry.reconciled).length, entries: Object.freeze(entries) })
})
findReplaceOperationDiagnosticsAtom.debugLabel = 'spreadsheet.findReplace.operationDiagnostics'

export const replaceAllCappedAtom: Atom<Readonly<ReplaceAllCapInfo> | null> = atom((get) => {
  const value = get(replaceAllCappedStateAtom)
  return value === null ? null : Object.freeze({ ...value })
})
replaceAllCappedAtom.debugLabel = 'spreadsheet.findReplace.replaceAllCapped'

export const findReplaceFormQueryAtom: Atom<Readonly<FindReplaceQuery>> = atom((get) => freezeQuery(queryFromForm(get(findReplaceFormStateAtom))))
findReplaceFormQueryAtom.debugLabel = 'spreadsheet.findReplace.formQuery'

export const findReplaceOpenAtom: Atom<boolean> = atom((get) => get(findReplaceSessionStateAtom).open)
findReplaceOpenAtom.debugLabel = 'spreadsheet.findReplace.open'

export const findReplaceAvailabilityErrorAtom: Atom<Readonly<SpreadsheetError> | null> = atom((get) => {
  const value = get(findReplaceSessionStateAtom).availabilityError
  return value === null ? null : Object.freeze({ ...value })
})
findReplaceAvailabilityErrorAtom.debugLabel = 'spreadsheet.findReplace.availabilityError'

export const findReplaceErrorAtom: Atom<Readonly<SpreadsheetError> | null> = atom((get) => {
  const commandError = get(findReplaceCommandErrorStateAtom)
  if (commandError !== null) return Object.freeze({ ...commandError })
  const cursor = publicCursor(get)
  return cursor.error === undefined ? null : Object.freeze({ ...cursor.error })
})
findReplaceErrorAtom.debugLabel = 'spreadsheet.findReplace.error'

export const findReplacePendingAtom: Atom<boolean> = atom((get) => {
  const session = get(findReplaceSessionStateAtom)
  return session.activeSearchTicket !== null || session.pendingMutation !== null || session.recovery?.status === 'refreshing'
})
findReplacePendingAtom.debugLabel = 'spreadsheet.findReplace.pending'

export const findReplaceMutationBlockedAtom: Atom<boolean> = atom((get) => {
  const session = get(findReplaceSessionStateAtom)
  const cursor = publicCursor(get)
  const resultTicket = session.resultTicket
  return !session.open || session.pendingMutation !== null || session.activeSearchTicket !== null || session.recovery !== null || resultTicket === null || get(findReplaceOperationAttemptLedgerStateAtom).some((attempt) => attemptBlocksMutationForTarget(attempt, resultTicket.search)) || !isResultTicketCurrent(get, resultTicket) || cursor.status !== 'ready' || cursor.pageMatches.length === 0
})
findReplaceMutationBlockedAtom.debugLabel = 'spreadsheet.findReplace.mutationBlocked'
