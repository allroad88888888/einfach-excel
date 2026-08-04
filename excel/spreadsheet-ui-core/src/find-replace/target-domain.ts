import type { Getter } from '@einfach/core'
import {
  EXCEL_MAX_COLS,
  EXCEL_MAX_ROWS,
  selectionAuthorityWitnessAtom,
  selectionSnapshotAtom,
} from '../selection'
import type { SelectionState } from '../selection'
import { workspaceActiveSheetAuthorityWitnessAtom, workspaceSessionAtom } from '../workspace'
import type { ProjectionRevision } from '../backend/types'
import type { CellRange, SpreadsheetError } from '../shared'
import type { FindCursorState, FindReplaceQuery, SearchRangeRequest } from './types'
import { MAX_FIND_PAGE, INITIAL_CURSOR } from './constants'
import type { SearchResultTicket, SearchTicket } from './internal-types'
import { findReplaceCursorStateAtom, findReplaceFormStateAtom, findReplaceSessionStateAtom } from './state'
import { copyCursor, copyQuery, copyRange, error, sameQuery, sameRange, sameSelection, searchQueryFromForm } from './value-domain'

export function effectiveSheetId(get: Getter, scope: FindReplaceQuery['options']['scope']): string | SpreadsheetError {
  const workspaceSheetId = get(workspaceSessionAtom).activeSheetId ?? ''
  const selectionSheetId = get(selectionSnapshotAtom).selection.sheetId
  if (workspaceSheetId.length === 0) return error('FIND_REPLACE_SHEET_UNAVAILABLE', 'Find and replace requires an active workspace sheet', 'validation')
  if (scope === 'current-selection' && selectionSheetId.length === 0) return error('FIND_REPLACE_SELECTION_UNAVAILABLE', 'Selection search requires a selection on the active sheet', 'validation')
  if (selectionSheetId.length > 0 && selectionSheetId !== workspaceSheetId) return error('FIND_REPLACE_SHEET_MISMATCH', 'The active workspace sheet and selection sheet do not match', 'validation')
  return workspaceSheetId
}

function copySelection(selection: SelectionState): SelectionState {
  switch (selection.kind) {
    case 'cell': case 'range': return { ...selection, anchor: { ...selection.anchor }, focus: { ...selection.focus } }
    case 'row': case 'column': case 'all': return { ...selection }
  }
}

function liveSelectionMatchesTicket(get: Getter, ticket: SearchTicket): boolean {
  const snapshot = get(selectionSnapshotAtom)
  if (get(selectionAuthorityWitnessAtom) === ticket.selectionWitness && sameSelection(snapshot.selection, ticket.selection) && sameRange(snapshot.range, ticket.selectionRange)) return true
  const ownedFocus = get(findReplaceSessionStateAtom).ownedFocus
  return ownedFocus !== null && ownedFocus.searchRequestId === ticket.requestId && get(selectionAuthorityWitnessAtom) === ownedFocus.receipt.witness && sameSelection(snapshot.selection, ownedFocus.receipt.selection) && sameRange(snapshot.range, ownedFocus.receipt.range)
}

function liveWitnessMatchesTicket(get: Getter, ticket: SearchTicket): boolean {
  const scope = ticket.request.query.options.scope
  const sheetId = effectiveSheetId(get, scope)
  if (typeof sheetId !== 'string' || sheetId !== ticket.request.sheetId) return false
  if (get(workspaceSessionAtom).activeSheetId !== ticket.workspaceSheetId || get(workspaceActiveSheetAuthorityWitnessAtom) !== ticket.workspaceWitness) return false
  return scope !== 'current-selection' || liveSelectionMatchesTicket(get, ticket)
}

export function ticketInputsCurrent(get: Getter, ticket: SearchTicket): boolean {
  const session = get(findReplaceSessionStateAtom)
  return session.open && session.sessionId === ticket.sessionId && sameQuery(searchQueryFromForm(get(findReplaceFormStateAtom)), ticket.request.query) && liveWitnessMatchesTicket(get, ticket)
}

export function isResultTicketCurrent(get: Getter, ticket: SearchResultTicket): boolean {
  return get(findReplaceSessionStateAtom).resultTicket === ticket && ticketInputsCurrent(get, ticket.search)
}

export function publicCursor(get: Getter): FindCursorState {
  const session = get(findReplaceSessionStateAtom)
  const visible = session.compatibilityCursor || session.cursorOwnerTicket === null || ticketInputsCurrent(get, session.cursorOwnerTicket)
  return visible ? copyCursor(get(findReplaceCursorStateAtom)) : copyCursor(INITIAL_CURSOR)
}

export function resolveSearchRange(get: Getter, scope: FindReplaceQuery['options']['scope']): CellRange {
  if (scope === 'sheet') return { rowStart: 0, rowEnd: EXCEL_MAX_ROWS - 1, colStart: 0, colEnd: EXCEL_MAX_COLS - 1 }
  const session = get(findReplaceSessionStateAtom)
  if (scope === 'current-selection' && session.resultTicket !== null && session.ownedFocus !== null && isResultTicketCurrent(get, session.resultTicket)) return copyRange(session.resultTicket.search.request.range)
  return copyRange(get(selectionSnapshotAtom).range)
}

export function createSearchTicket(get: Getter, requestId: number, query: FindReplaceQuery, range: CellRange, revision?: ProjectionRevision): SearchTicket {
  const session = get(findReplaceSessionStateAtom)
  const workspace = get(workspaceSessionAtom)
  const selection = get(selectionSnapshotAtom)
  const request: SearchRangeRequest = { kind: 'search-range', sheetId: workspace.activeSheetId!, range: copyRange(range), query: copyQuery(query), pageStart: 0, pageSize: MAX_FIND_PAGE, requestId, ...(revision === undefined ? {} : { revision }) }
  return { sessionId: session.sessionId, requestId, request: Object.freeze(request), workspaceSheetId: workspace.activeSheetId!, workspaceWitness: get(workspaceActiveSheetAuthorityWitnessAtom), selection: Object.freeze(copySelection(selection.selection)), selectionRange: Object.freeze(copyRange(selection.range)), selectionWitness: get(selectionAuthorityWitnessAtom) }
}
