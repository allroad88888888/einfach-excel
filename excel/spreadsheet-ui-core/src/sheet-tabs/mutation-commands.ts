import { atom } from '@einfach/core'
import { applySheetTabIntent, createBeginSheetTabRenameIntent, createCloseSheetTabContextMenuIntent } from './intents'
import { normalizeSheetTabDraftName, nextSheetTabName } from './metadata'
import { runSheetTabMutation } from './mutation-runner'
import { issueSheetTabRequestId, sheetTabMutationCanStart } from './ports'
import { sheetTabsAtom, sheetTabsSheetsAtom } from './state'
import type { BeginSheetTabRenameCommandInput, CommitSheetTabRenameCommandInput, CommitSheetTabReorderCommandInput, RequestSheetTabDeleteInput } from './types'
import { workspaceActiveSheetAuthorityWitnessAtom, workspaceSessionAtom } from '../workspace'

export const beginSheetTabRenameAtom = atom(null, (get, set, input: BeginSheetTabRenameCommandInput): boolean => {
  const state = get(sheetTabsAtom)
  if (!sheetTabMutationCanStart(state, 'rename') || !get(sheetTabsSheetsAtom).some((sheet) => sheet.id === input.sheetId)) return false
  const intent = createBeginSheetTabRenameIntent(input)
  if (intent === null) return false
  set(sheetTabsAtom, { ...applySheetTabIntent(state, intent), error: null })
  return true
})
export const commitSheetTabRenameAtom = atom(null, async (get, set, input: CommitSheetTabRenameCommandInput): Promise<void> => {
  const state = get(sheetTabsAtom)
  const rename = state.rename
  if (!sheetTabMutationCanStart(state, 'rename') || rename === null || rename.sheetId !== input.sheetId) return
  const name = normalizeSheetTabDraftName(rename.draftName)
  if (name === null) { set(sheetTabsAtom, { ...state, error: 'Sheet name cannot be empty' }); return }
  const requestId = issueSheetTabRequestId(get, set)
  if (requestId === null) { set(sheetTabsAtom, { ...state, error: 'Sheet mutation request identity is unavailable' }); return }
  await runSheetTabMutation(get, set, { kind: 'rename', phase: 'pending', requestId, sessionId: state.sessionId, sheetId: rename.sheetId, activeSheetIdAtDispatch: get(workspaceSessionAtom).activeSheetId, name })
})
export const addSheetTabAtom = atom(null, async (get, set): Promise<void> => {
  const state = get(sheetTabsAtom)
  if (!sheetTabMutationCanStart(state, 'add')) return
  const requestId = issueSheetTabRequestId(get, set)
  if (requestId === null) { set(sheetTabsAtom, { ...state, error: 'Sheet mutation request identity is unavailable' }); return }
  await runSheetTabMutation(get, set, { kind: 'add', phase: 'pending', requestId, sessionId: state.sessionId, sheetId: null, activeSheetIdAtDispatch: get(workspaceSessionAtom).activeSheetId, activeSheetAuthorityWitnessAtDispatch: get(workspaceActiveSheetAuthorityWitnessAtom), name: nextSheetTabName(get(sheetTabsSheetsAtom)) })
})
export const requestSheetTabDeleteAtom = atom(null, (get, set, input: RequestSheetTabDeleteInput): boolean => {
  const state = get(sheetTabsAtom); const sheets = get(sheetTabsSheetsAtom); const sheet = sheets.find((candidate) => candidate.id === input.sheetId)
  if (!sheetTabMutationCanStart(state, 'delete') || sheets.length <= 1 || !sheet) return false
  set(sheetTabsAtom, { ...applySheetTabIntent(state, createCloseSheetTabContextMenuIntent('committed')), deleteConfirmation: { sheetId: sheet.id, sheetName: sheet.name }, error: null })
  return true
})
export const cancelSheetTabDeleteAtom = atom(null, (get, set): void => { const state = get(sheetTabsAtom); if (state.phase !== 'ready' || state.mutation !== null) return; set(sheetTabsAtom, { ...state, deleteConfirmation: null }) })
export const confirmSheetTabDeleteAtom = atom(null, async (get, set): Promise<void> => {
  const state = get(sheetTabsAtom); const confirmation = state.deleteConfirmation
  if (!sheetTabMutationCanStart(state, 'delete') || confirmation === null) return
  if (get(sheetTabsSheetsAtom).length <= 1 || !get(sheetTabsSheetsAtom).some((sheet) => sheet.id === confirmation.sheetId)) { set(sheetTabsAtom, { ...state, deleteConfirmation: null, error: 'The selected sheet is no longer available' }); return }
  const requestId = issueSheetTabRequestId(get, set)
  if (requestId === null) { set(sheetTabsAtom, { ...state, error: 'Sheet mutation request identity is unavailable' }); return }
  await runSheetTabMutation(get, set, { kind: 'delete', phase: 'pending', requestId, sessionId: state.sessionId, sheetId: confirmation.sheetId, activeSheetIdAtDispatch: get(workspaceSessionAtom).activeSheetId })
})
export const commitSheetTabReorderAtom = atom(null, async (get, set, input: CommitSheetTabReorderCommandInput): Promise<void> => {
  const state = get(sheetTabsAtom); const reorder = state.reorder
  if (!sheetTabMutationCanStart(state, 'reorder') || reorder === null || reorder.sheetId !== input.sheetId) return
  const requestId = issueSheetTabRequestId(get, set)
  if (requestId === null) { set(sheetTabsAtom, { ...state, error: 'Sheet mutation request identity is unavailable' }); return }
  await runSheetTabMutation(get, set, { kind: 'reorder', phase: 'pending', requestId, sessionId: state.sessionId, sheetId: reorder.sheetId, activeSheetIdAtDispatch: get(workspaceSessionAtom).activeSheetId, beforeSheetId: reorder.beforeSheetId, afterSheetId: reorder.afterSheetId, targetIndex: reorder.targetIndex })
})
beginSheetTabRenameAtom.debugLabel = 'spreadsheet.sheetTabs.beginRename'
commitSheetTabRenameAtom.debugLabel = 'spreadsheet.sheetTabs.commitRename'
addSheetTabAtom.debugLabel = 'spreadsheet.sheetTabs.add'
requestSheetTabDeleteAtom.debugLabel = 'spreadsheet.sheetTabs.requestDelete'
cancelSheetTabDeleteAtom.debugLabel = 'spreadsheet.sheetTabs.cancelDelete'
confirmSheetTabDeleteAtom.debugLabel = 'spreadsheet.sheetTabs.confirmDelete'
commitSheetTabReorderAtom.debugLabel = 'spreadsheet.sheetTabs.commitReorder'
