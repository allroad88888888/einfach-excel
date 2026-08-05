import type { Getter, Setter } from '@einfach/core'
import { setSelectionWithAuthorityReceiptAtom } from '../selection'
import { scrollToCellAtom } from '../viewport'
import type { SpreadsheetError } from '../shared'
import { INITIAL_CURSOR } from './constants'
import { INITIAL_SESSION } from './internal-types'
import type { SearchTicket } from './internal-types'
import { cancelPendingMutation, reconcileUnknownAttemptsForTarget } from './ledger-domain'
import { ticketInputsCurrent } from './target-domain'
import { findReplaceCommandErrorStateAtom, findReplaceCursorStateAtom, findReplaceOperationAttemptLedgerStateAtom, findReplaceQueryStateAtom, findReplaceSessionStateAtom, replaceAllCappedStateAtom } from './state'
import { copyCursor, copyMatch, copyQuery, error, nextFindReplaceSessionId } from './value-domain'
import type { FindReplaceSessionState } from './internal-types'
import type { validateSearchResult } from './search-validation'

export function rotateLifecycle(get: Getter, set: Setter, open: boolean): FindReplaceSessionState {
  const previous = get(findReplaceSessionStateAtom)
  cancelPendingMutation(set, previous.pendingMutation)
  const sessionId = nextFindReplaceSessionId(previous.sessionId)
  if (sessionId === null) {
    const unavailable: FindReplaceSessionState = { ...INITIAL_SESSION, sessionId: previous.sessionId, availabilityError: error('FIND_REPLACE_SESSION_IDENTITY_UNAVAILABLE', 'Find/replace session identity is exhausted', 'validation'), authorityUnavailable: true }
    set(findReplaceSessionStateAtom, unavailable)
    return unavailable
  }
  const next: FindReplaceSessionState = { ...INITIAL_SESSION, open, sessionId }
  set(findReplaceSessionStateAtom, next)
  return next
}

export function resetDisplay(set: Setter): void {
  set(findReplaceQueryStateAtom, null)
  set(findReplaceCursorStateAtom, copyCursor(INITIAL_CURSOR))
  set(findReplaceCommandErrorStateAtom, null)
  set(replaceAllCappedStateAtom, null)
}

export function invalidateAuthority(get: Getter, set: Setter): void {
  const previous = get(findReplaceSessionStateAtom)
  cancelPendingMutation(set, previous.pendingMutation)
  const sessionId = nextFindReplaceSessionId(previous.sessionId)
  if (sessionId === null) { rotateLifecycle(get, set, false); resetDisplay(set); return }
  set(findReplaceSessionStateAtom, { ...INITIAL_SESSION, open: previous.open, sessionId })
  resetDisplay(set)
}

export function synchronizeFindReplaceTarget(get: Getter, set: Setter): boolean {
  const session = get(findReplaceSessionStateAtom)
  const tickets = [session.activeSearchTicket, session.resultTicket?.search ?? null, session.pendingMutation?.resultTicket.search ?? null, session.recovery?.sourceSearch ?? null].filter((ticket): ticket is SearchTicket => ticket !== null)
  if (tickets.every((ticket) => ticketInputsCurrent(get, ticket))) return false
  invalidateAuthority(get, set)
  return true
}

export function setCommandError(set: Setter, value: SpreadsheetError): void { set(findReplaceCommandErrorStateAtom, { ...value }) }

export function failSearchBeforeDispatch(set: Setter, value: SpreadsheetError): void {
  set(findReplaceCursorStateAtom, { status: 'error', currentIndex: 0, totalCount: 0, pageMatches: [], error: { ...value } })
  setCommandError(set, value)
  set(findReplaceSessionStateAtom, (session) => ({ ...session, activeSearchTicket: null, resultTicket: null, cursorOwnerTicket: null, compatibilityCursor: true, availabilityError: value.source === 'validation' ? { ...value } : null }))
}

export function acceptSearchResult(set: Setter, ticket: SearchTicket, accepted: NonNullable<ReturnType<typeof validateSearchResult>>, clearReplaceAllCap = true): void {
  const resultTicket = { search: ticket, revision: accepted.result.revision, matches: accepted.matches, totalCount: accepted.result.totalCount }
  const firstMatch = accepted.matches[0]
  let ownedFocus = null
  if (firstMatch !== undefined) {
    const receipt = set(setSelectionWithAuthorityReceiptAtom, { kind: 'cell', sheetId: firstMatch.sheetId, anchor: { ...firstMatch.coord }, focus: { ...firstMatch.coord } })
    if (receipt !== null) { ownedFocus = { searchRequestId: ticket.requestId, receipt }; set(scrollToCellAtom, { coord: { ...firstMatch.coord } }) }
  }
  set(findReplaceCursorStateAtom, { status: 'ready', currentIndex: 0, totalCount: accepted.result.totalCount, pageMatches: accepted.matches.map(copyMatch) })
  set(findReplaceQueryStateAtom, copyQuery(ticket.request.query))
  set(findReplaceCommandErrorStateAtom, null)
  if (clearReplaceAllCap) set(replaceAllCappedStateAtom, null)
  set(findReplaceOperationAttemptLedgerStateAtom, (ledger) => reconcileUnknownAttemptsForTarget(ledger, ticket))
  set(findReplaceSessionStateAtom, (session) => ({ ...session, activeSearchTicket: null, resultTicket, cursorOwnerTicket: ticket, compatibilityCursor: false, ownedFocus, recovery: null, availabilityError: null }))
}
