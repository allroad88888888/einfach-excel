import { atom } from '@einfach/core'
import type { Getter, Setter } from '@einfach/core'
import { setSelectionWithAuthorityReceiptAtom } from '../selection'
import { scrollToCellAtom } from '../viewport'
import type { SearchRangeRequest, SearchRangeResult, RunFindReplaceSearchInput } from './types'
import type { SearchTicket } from './internal-types'
import { allocateRequestId } from './ledger-domain'
import { acceptSearchResult, failSearchBeforeDispatch, setCommandError, synchronizeFindReplaceTarget } from './lifecycle-domain'
import { validateSearchResult } from './search-validation'
import { findReplaceCommandErrorStateAtom, findReplaceCursorStateAtom, findReplaceFormStateAtom, findReplaceQueryStateAtom, findReplaceSessionStateAtom } from './state'
import { createSearchTicket, effectiveSheetId, isResultTicketCurrent, publicCursor, resolveSearchRange, ticketInputsCurrent } from './target-domain'
import { copyQuery, error, isProjectionRevision, normalizeError, normalizeTimeoutMs, searchQueryFromForm, validateRegex, waitForTransport } from './value-domain'

async function executeSearch(get: Getter, set: Setter, ticket: SearchTicket, searchRange: NonNullable<RunFindReplaceSearchInput['searchRange']>, timeoutMs: number): Promise<void> {
  await Promise.resolve()
  if (get(findReplaceSessionStateAtom).activeSearchTicket !== ticket || !ticketInputsCurrent(get, ticket)) return
  let promise: Promise<SearchRangeResult>
  try { promise = Promise.resolve(searchRange(ticket.request as SearchRangeRequest)) } catch (transportError) {
    const normalized = normalizeError(transportError)
    if (get(findReplaceSessionStateAtom).activeSearchTicket === ticket) failSearchBeforeDispatch(set, normalized)
    return
  }
  const outcome = await waitForTransport(promise, timeoutMs)
  if (get(findReplaceSessionStateAtom).activeSearchTicket !== ticket || !ticketInputsCurrent(get, ticket)) return
  if (outcome.kind === 'timeout') { failSearchBeforeDispatch(set, error('FIND_REPLACE_TIMEOUT', 'Find/replace search timed out', 'transport')); return }
  if (outcome.kind === 'rejected') { failSearchBeforeDispatch(set, normalizeError(outcome.error)); return }
  const accepted = validateSearchResult(outcome.value, ticket)
  if (accepted === null) { failSearchBeforeDispatch(set, error('FIND_REPLACE_PROTOCOL_ERROR', 'Search response failed exact correlation', 'transport')); return }
  acceptSearchResult(set, ticket, accepted)
}

export const runFindReplaceSearchAtom = atom(null, (get, set, input: RunFindReplaceSearchInput): Promise<void> | void => {
  if (synchronizeFindReplaceTarget(get, set)) return
  const session = get(findReplaceSessionStateAtom)
  if (!session.open || session.authorityUnavailable || session.activeSearchTicket !== null || session.pendingMutation !== null || session.recovery !== null) return
  const form = get(findReplaceFormStateAtom)
  if (form.needle.length === 0) { failSearchBeforeDispatch(set, error('FIND_REPLACE_EMPTY_NEEDLE', 'Enter text to find', 'validation')); return }
  const regexError = validateRegex(form)
  if (regexError !== null) { failSearchBeforeDispatch(set, regexError); return }
  if (form.scope === 'workbook') { failSearchBeforeDispatch(set, error('FIND_REPLACE_WORKBOOK_UNAVAILABLE', 'Workbook search is not available in this backend contract', 'validation')); return }
  const sheetId = effectiveSheetId(get, form.scope)
  if (typeof sheetId !== 'string') { failSearchBeforeDispatch(set, sheetId); return }
  if (typeof input?.searchRange !== 'function') { failSearchBeforeDispatch(set, error('FIND_REPLACE_SEARCH_UNAVAILABLE', 'The search backend port is unavailable', 'validation')); return }
  if (input.revision !== undefined && !isProjectionRevision(input.revision)) { failSearchBeforeDispatch(set, error('FIND_REPLACE_REVISION_MISMATCH', 'Search revision is invalid', 'validation')); return }
  const requestId = allocateRequestId(get, set)
  if (requestId === null) { failSearchBeforeDispatch(set, error('FIND_REPLACE_REQUEST_IDENTITY_UNAVAILABLE', 'Find/replace request identity is exhausted', 'validation')); return }
  const query = searchQueryFromForm(form)
  const ticket = createSearchTicket(get, requestId, query, resolveSearchRange(get, form.scope), input.revision)
  set(findReplaceQueryStateAtom, copyQuery(query))
  set(findReplaceCursorStateAtom, { status: 'searching', currentIndex: 0, totalCount: 0, pageMatches: [] })
  set(findReplaceCommandErrorStateAtom, null)
  set(findReplaceSessionStateAtom, { ...session, activeSearchTicket: ticket, resultTicket: null, cursorOwnerTicket: ticket, compatibilityCursor: false, availabilityError: null })
  return executeSearch(get, set, ticket, input.searchRange, normalizeTimeoutMs(input.timeoutMs))
})
runFindReplaceSearchAtom.debugLabel = 'spreadsheet.findReplace.runSearch'

export const stepFindReplaceAtom = atom(null, (get, set, input: RunFindReplaceSearchInput & { readonly direction: 1 | -1 }): Promise<void> | void => {
  if (synchronizeFindReplaceTarget(get, set)) return
  const session = get(findReplaceSessionStateAtom)
  if (session.activeSearchTicket !== null || session.pendingMutation !== null || session.recovery?.status === 'refreshing') return
  const cursor = publicCursor(get)
  if (cursor.pageMatches.length === 0) return set(runFindReplaceSearchAtom, input)
  if (input.direction !== 1 && input.direction !== -1) return
  const currentIndex = (cursor.currentIndex + input.direction + cursor.pageMatches.length) % cursor.pageMatches.length
  const match = cursor.pageMatches[currentIndex]
  const resultTicket = get(findReplaceSessionStateAtom).resultTicket
  const resultTicketWasCurrent = resultTicket !== null && isResultTicketCurrent(get, resultTicket)
  const receipt = set(setSelectionWithAuthorityReceiptAtom, { kind: 'cell', sheetId: match.sheetId, anchor: { ...match.coord }, focus: { ...match.coord } })
  if (receipt === null) { setCommandError(set, error('FIND_REPLACE_FOCUS_STALE', 'The match could not become the active selection', 'validation')); return }
  set(scrollToCellAtom, { coord: { ...match.coord } })
  set(findReplaceCursorStateAtom, { ...cursor, currentIndex })
  if (resultTicket !== null && resultTicketWasCurrent) set(findReplaceSessionStateAtom, (current) => ({ ...current, ownedFocus: { searchRequestId: resultTicket.search.requestId, receipt } }))
})
stepFindReplaceAtom.debugLabel = 'spreadsheet.findReplace.step'
