import type { Getter, Setter } from '@einfach/core'
import { createCommitSheetTabRenameIntent, createCommitSheetTabReorderIntent, applySheetTabIntent } from './intents'
import { invokeSheetTabMutationPort, mutationResultStateFromPlan, mutationStateFromPlan, projectionConfirmsSheetTabMutation, settleSheetTabMutation, sheetTabMutationIsCurrent, sheetTabMutationResultMatches } from './mutation-domain'
import { sheetTabErrorMessage, snapshotSheetListProjection } from './ports'
import { commitSheetProjection } from './projection'
import { sheetTabsAtom, sheetTabsPortsAtom, sheetTabsSheetStateAtom, sheetTabsSheetsAtom } from './state'
import type { SheetTabMutationPlan } from './types'
import { workspaceActiveSheetAuthorityWitnessAtom, workspaceSessionAtom } from '../workspace'
import { sheetTabMutationCanStart } from './ports'

export async function runSheetTabMutation(get: Getter, set: Setter, plan: SheetTabMutationPlan): Promise<void> {
  const state = get(sheetTabsAtom)
  if (state.sessionId !== plan.sessionId || !sheetTabMutationCanStart(state, plan.kind)) return
  const ports = get(sheetTabsPortsAtom)
  const sourceSheets = get(sheetTabsSheetsAtom)
  set(sheetTabsAtom, { ...state, mutation: mutationStateFromPlan(plan), lastMutation: null, error: null })
  let result
  try { result = await invokeSheetTabMutationPort(ports, plan, get(sheetTabsSheetStateAtom).revision) } catch (error) { settleSheetTabMutation(get, set, plan, 'rejected', sheetTabErrorMessage(error, `Sheet ${plan.kind} failed`)); return }
  if (!sheetTabMutationIsCurrent(get(sheetTabsAtom), plan)) return
  if (!sheetTabMutationResultMatches(result, plan)) { settleSheetTabMutation(get, set, plan, 'protocol-error', 'Ignored a sheet mutation response that did not match its request'); return }
  const acknowledged = get(sheetTabsAtom)
  set(sheetTabsAtom, { ...acknowledged, mutation: { ...mutationStateFromPlan(plan), phase: result.sheets === undefined ? 'refreshing' : 'acknowledged' } })
  let projection
  if (result.sheets !== undefined) projection = snapshotSheetListProjection({ sheets: result.sheets, revision: result.revision })
  else if (!ports.listSheets) { settleSheetTabMutation(get, set, plan, 'projection-error', 'Sheet mutation was acknowledged, but live sheet refresh is unavailable'); return }
  else { try { projection = snapshotSheetListProjection(await ports.listSheets()) } catch (error) { settleSheetTabMutation(get, set, plan, 'projection-error', sheetTabErrorMessage(error, 'Sheet mutation was acknowledged, but refresh failed')); return } }
  if (!sheetTabMutationIsCurrent(get(sheetTabsAtom), plan)) return
  if (projection === null || !projectionConfirmsSheetTabMutation(sourceSheets, projection.sheets, result, plan)) { settleSheetTabMutation(get, set, plan, 'projection-error', 'Sheet mutation was acknowledged, but the refreshed sheet list did not confirm it'); return }
  const currentActive = get(workspaceSessionAtom).activeSheetId
  let preferred = currentActive
  if (currentActive === plan.activeSheetIdAtDispatch) {
    if (plan.kind === 'add' && get(workspaceActiveSheetAuthorityWitnessAtom) === plan.activeSheetAuthorityWitnessAtDispatch) preferred = result.activeSheetId ?? result.sheetId ?? currentActive
    else if (plan.kind === 'delete' && currentActive === plan.sheetId) preferred = result.activeSheetId ?? null
  }
  commitSheetProjection(get, set, projection.sheets, projection.revision, preferred)
  const settled = get(sheetTabsAtom)
  if (!sheetTabMutationIsCurrent(settled, plan)) return
  let next = settled
  if (plan.kind === 'rename' && plan.sheetId && plan.name) { const intent = createCommitSheetTabRenameIntent({ sheetId: plan.sheetId, name: plan.name, source: next.rename?.source }); if (intent) next = applySheetTabIntent(next, intent) }
  else if (plan.kind === 'reorder' && plan.sheetId) next = applySheetTabIntent(next, createCommitSheetTabReorderIntent({ sheetId: plan.sheetId, beforeSheetId: plan.beforeSheetId, afterSheetId: plan.afterSheetId, targetIndex: plan.targetIndex }))
  set(sheetTabsAtom, { ...next, phase: 'ready', mutation: null, lastMutation: mutationResultStateFromPlan(plan, 'acknowledged'), error: null, contextMenu: null, deleteConfirmation: plan.kind === 'delete' ? null : next.deleteConfirmation })
}
