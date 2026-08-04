import type { ProjectionRevision } from '../backend/types'
import type { SelectionState } from '../selection'
import type { CellCoord, CellRange, SpreadsheetError } from '../shared'
import { DEFAULT_TRANSPORT_TIMEOUT_MS, MAX_TRANSPORT_TIMEOUT_MS } from './constants'
import type { TicketedFindMatch, TransportOutcome } from './internal-types'
import type { FindCursorState, FindMatch, FindReplaceFormState, FindReplaceQuery, FindReplaceTarget } from './types'

export interface FindReplaceMutationIdentityPlan { readonly requestId: number; readonly operationId: string }

export function nextFindReplaceSessionId(sessionId: number): number | null {
  return Number.isSafeInteger(sessionId) && sessionId >= 0 && sessionId < Number.MAX_SAFE_INTEGER ? sessionId + 1 : null
}

export function nextFindReplaceSearchRequestId(sequence: number): number | null {
  return Number.isSafeInteger(sequence) && sequence >= 0 && sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : null
}

export function planFindReplaceMutationIdentity(sequence: number): Readonly<FindReplaceMutationIdentityPlan> | null {
  const requestId = nextFindReplaceSearchRequestId(sequence)
  return requestId === null ? null : Object.freeze({ requestId, operationId: `find-replace-${requestId}` })
}

export function copyRange(range: CellRange): CellRange { return { ...range } }
export function sameRange(left: CellRange, right: CellRange): boolean { return left.rowStart === right.rowStart && left.rowEnd === right.rowEnd && left.colStart === right.colStart && left.colEnd === right.colEnd }
export function sameCoord(left: CellCoord, right: CellCoord): boolean { return left.row === right.row && left.col === right.col }

export function sameSelection(left: SelectionState, right: SelectionState): boolean {
  if (left.kind !== right.kind || left.sheetId !== right.sheetId) return false
  switch (left.kind) {
    case 'cell': case 'range': return right.kind === left.kind && sameCoord(left.anchor, right.anchor) && sameCoord(left.focus, right.focus)
    case 'row': return right.kind === 'row' && left.rowAnchor === right.rowAnchor && left.rowFocus === right.rowFocus
    case 'column': return right.kind === 'column' && left.colAnchor === right.colAnchor && left.colFocus === right.colFocus
    case 'all': return right.kind === 'all'
  }
}

export function copyQuery(query: FindReplaceQuery): FindReplaceQuery { return { needle: query.needle, ...(query.replacement === undefined ? {} : { replacement: query.replacement }), options: { ...query.options } } }
export function freezeQuery(query: FindReplaceQuery): Readonly<FindReplaceQuery> { return Object.freeze({ ...copyQuery(query), options: Object.freeze({ ...query.options }) }) }
export function sameQuery(left: FindReplaceQuery, right: FindReplaceQuery): boolean { return left.needle === right.needle && left.replacement === right.replacement && left.options.scope === right.options.scope && Boolean(left.options.caseSensitive) === Boolean(right.options.caseSensitive) && Boolean(left.options.wholeMatch) === Boolean(right.options.wholeMatch) && Boolean(left.options.regex) === Boolean(right.options.regex) && Boolean(left.options.searchFormulas) === Boolean(right.options.searchFormulas) }

export function copyMatch(match: FindMatch | TicketedFindMatch): FindMatch { return { coord: { ...match.coord }, sheetId: match.sheetId, matchStart: match.matchStart, matchEnd: match.matchEnd, ...(match.target === undefined || match.target === null ? {} : { target: match.target }) } }
export function copyCursor(cursor: FindCursorState): FindCursorState { return { status: cursor.status, currentIndex: cursor.currentIndex, totalCount: cursor.totalCount, pageMatches: cursor.pageMatches.map(copyMatch), ...(cursor.error === undefined ? {} : { error: { ...cursor.error } }) } }
export function freezeCursor(cursor: FindCursorState): Readonly<FindCursorState> { return Object.freeze({ ...cursor, pageMatches: Object.freeze(cursor.pageMatches.map((match) => Object.freeze({ ...copyMatch(match), coord: Object.freeze({ ...match.coord }) }))), ...(cursor.error === undefined ? {} : { error: Object.freeze({ ...cursor.error }) }) }) }

export function queryFromForm(form: FindReplaceFormState): FindReplaceQuery { return { needle: form.needle, ...(form.replacement === '' ? {} : { replacement: form.replacement }), options: { caseSensitive: form.caseSensitive, wholeMatch: form.wholeMatch, regex: form.regex, searchFormulas: form.searchFormulas, scope: form.scope } } }
export function searchQueryFromForm(form: FindReplaceFormState): FindReplaceQuery { return { needle: form.needle, options: { caseSensitive: form.caseSensitive, wholeMatch: form.wholeMatch, regex: form.regex, searchFormulas: form.searchFormulas, scope: form.scope } } }

export function error(code: string, message: string, source: SpreadsheetError['source']): SpreadsheetError { return { code, message, source } }
export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
export function isSpreadsheetErrorSource(value: unknown): value is SpreadsheetError['source'] { return value === 'parse' || value === 'runtime' || value === 'permission' || value === 'transport' || value === 'validation' || value === 'projection' || value === 'unknown' }
export function normalizeError(value: unknown): SpreadsheetError { if (value instanceof Error) return error('BACKEND_ERROR', value.message || 'Find/replace backend request failed', 'transport'); if (typeof value === 'string') return error('BACKEND_ERROR', value, 'transport'); if (isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string') return error(value.code, value.message, isSpreadsheetErrorSource(value.source) ? value.source : 'transport'); return error('BACKEND_ERROR', 'Find/replace backend request failed', 'transport') }
export function isProjectionRevision(value: unknown): value is ProjectionRevision { return (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) || (typeof value === 'string' && value.length > 0) }
export function isSafeIndex(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
export function isFindReplaceTarget(value: unknown): value is FindReplaceTarget { return value === 'displayValue' || value === 'formula' }
export function normalizeTimeoutMs(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_TRANSPORT_TIMEOUT_MS ? value : DEFAULT_TRANSPORT_TIMEOUT_MS }

export async function waitForTransport<T>(promise: Promise<T>, timeoutMs: number): Promise<TransportOutcome<T>> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  const transport = promise.then<TransportOutcome<T>, TransportOutcome<T>>((value) => ({ kind: 'fulfilled', value }), (transportError) => ({ kind: 'rejected', error: transportError }))
  const timeout = new Promise<TransportOutcome<T>>((resolve) => { timeoutHandle = setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs) })
  const outcome = await Promise.race([transport, timeout])
  if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  return outcome
}

export function validateRegex(form: FindReplaceFormState): SpreadsheetError | null {
  if (!form.regex || form.needle.length === 0) return null
  try { new RegExp(form.needle, form.caseSensitive ? '' : 'i'); return null } catch (regexError) { return error('FIND_REPLACE_INVALID_REGEX', `Invalid regular expression: ${regexError instanceof Error ? regexError.message : 'invalid'}`, 'validation') }
}
