import { atom } from '@einfach/core'
import { DEFAULT_FIND_REPLACE_FORM_STATE, MAX_FIND_PAGE } from './constants'
import { invalidateAuthority, resetDisplay, rotateLifecycle, synchronizeFindReplaceTarget } from './lifecycle-domain'
import { findReplaceCapabilityStateAtom, findReplaceCommandErrorStateAtom, findReplaceCursorStateAtom, findReplaceFormStateAtom, findReplaceQueryStateAtom, findReplaceSessionStateAtom, replaceAllCappedStateAtom } from './state'
import { publicCursor } from './target-domain'
import { copyMatch, copyQuery, normalizeError } from './value-domain'
import type { FindReplaceControllerPort, FindReplaceFormState, FindReplaceQuery, ReplaceAllCapInfo, SearchRangeResult } from './types'

function setFindReplaceOpen(get: Parameters<typeof rotateLifecycle>[0], set: Parameters<typeof rotateLifecycle>[1], open: boolean): void {
  if (open === get(findReplaceSessionStateAtom).open) return
  rotateLifecycle(get, set, open)
  set(findReplaceFormStateAtom, { ...DEFAULT_FIND_REPLACE_FORM_STATE })
  resetDisplay(set)
}

export const syncFindReplaceTargetAtom = atom(null, (get, set): void => { synchronizeFindReplaceTarget(get, set) })
syncFindReplaceTargetAtom.debugLabel = 'spreadsheet.findReplace.syncTarget'

export const updateFindReplaceFormAtom = atom(null, (get, set, patch: Partial<FindReplaceFormState>): void => {
  if (synchronizeFindReplaceTarget(get, set)) return
  const previous = get(findReplaceFormStateAtom)
  const next = { ...previous, ...patch }
  const searchChanged = next.needle !== previous.needle || next.caseSensitive !== previous.caseSensitive || next.wholeMatch !== previous.wholeMatch || next.regex !== previous.regex || next.searchFormulas !== previous.searchFormulas || next.scope !== previous.scope
  set(findReplaceFormStateAtom, next)
  set(findReplaceCommandErrorStateAtom, null)
  if (searchChanged) invalidateAuthority(get, set)
})
updateFindReplaceFormAtom.debugLabel = 'spreadsheet.findReplace.updateForm'

export const captureFindReplaceCapabilityAtom = atom(null, (_get, set, source: FindReplaceControllerPort): void => {
  let hasSearch = false
  let hasReplace = false
  try { hasSearch = typeof source?.searchRange === 'function'; hasReplace = typeof source?.replaceMatches === 'function' } catch { hasSearch = false; hasReplace = false }
  set(findReplaceCapabilityStateAtom, !hasSearch ? 'unsupported' : hasReplace ? 'find-and-replace' : 'find-only')
})
captureFindReplaceCapabilityAtom.debugLabel = 'spreadsheet.findReplace.captureCapability'

export const openFindReplaceAtom = atom(null, (get, set): void => { setFindReplaceOpen(get, set, true) })
openFindReplaceAtom.debugLabel = 'spreadsheet.findReplace.openCommand'

export const openFindReplaceFromEntrypointAtom = atom(null, (get, set): boolean => {
  const capability = get(findReplaceCapabilityStateAtom)
  if (capability !== 'find-only' && capability !== 'find-and-replace') return false
  setFindReplaceOpen(get, set, true)
  return true
})
openFindReplaceFromEntrypointAtom.debugLabel = 'spreadsheet.findReplace.openFromEntrypoint'

export const closeFindReplaceAtom = atom(null, (get, set): void => { setFindReplaceOpen(get, set, false) })
closeFindReplaceAtom.debugLabel = 'spreadsheet.findReplace.closeCommand'

export const commitFindReplaceQueryAtom = atom(null, (get, set, query: FindReplaceQuery): void => {
  const form = get(findReplaceFormStateAtom)
  set(updateFindReplaceFormAtom, { needle: query.needle, replacement: query.replacement ?? form.replacement, caseSensitive: Boolean(query.options.caseSensitive), wholeMatch: Boolean(query.options.wholeMatch), regex: Boolean(query.options.regex), searchFormulas: Boolean(query.options.searchFormulas), scope: query.options.scope })
  set(findReplaceQueryStateAtom, copyQuery(query))
})
commitFindReplaceQueryAtom.debugLabel = 'spreadsheet.findReplace.commitQuery'

export const markReplaceAllCappedAtom = atom(null, (_get, set, info: ReplaceAllCapInfo): void => { set(replaceAllCappedStateAtom, { ...info }) })
markReplaceAllCappedAtom.debugLabel = 'spreadsheet.findReplace.markReplaceAllCapped'

export const setFindMatchesAtom = atom(null, (get, set, result: SearchRangeResult): void => {
  invalidateAuthority(get, set)
  const matches = Array.isArray(result.matches) ? result.matches.slice(0, MAX_FIND_PAGE).map(copyMatch) : []
  set(findReplaceCursorStateAtom, { status: 'ready', currentIndex: 0, totalCount: Number.isSafeInteger(result.totalCount) && result.totalCount >= matches.length ? result.totalCount : matches.length, pageMatches: matches })
  set(findReplaceSessionStateAtom, (session) => ({ ...session, compatibilityCursor: true }))
})
setFindMatchesAtom.debugLabel = 'spreadsheet.findReplace.setMatches'

export const setFindReplaceErrorAtom = atom(null, (_get, set, value: unknown): void => {
  const normalized = normalizeError(value)
  set(findReplaceCommandErrorStateAtom, normalized)
  set(findReplaceCursorStateAtom, { status: 'error', currentIndex: 0, totalCount: 0, pageMatches: [], error: normalized })
  set(findReplaceSessionStateAtom, (session) => ({ ...session, compatibilityCursor: true }))
})
setFindReplaceErrorAtom.debugLabel = 'spreadsheet.findReplace.setError'

export const advanceFindCursorAtom = atom(null, (get, set, direction: 1 | -1): void => {
  if (direction !== 1 && direction !== -1) return
  const cursor = publicCursor(get)
  if (cursor.pageMatches.length === 0) return
  set(findReplaceCursorStateAtom, { ...cursor, currentIndex: (cursor.currentIndex + direction + cursor.pageMatches.length) % cursor.pageMatches.length })
})
advanceFindCursorAtom.debugLabel = 'spreadsheet.findReplace.advanceCursor'
