import type { Getter, Setter } from '@einfach/core'
import type { ProjectionRevision, SheetMutationResult, SpreadsheetSheetMetadata } from '../backend'
import { reorderSheetMetadata } from './metadata'
import { sheetTabsAtom } from './state'
import type { CapturedSheetTabsPorts, SheetTabMutationOutcome, SheetTabMutationPlan, SheetTabMutationResultState, SheetTabMutationState, SheetTabsState } from './types'

export function invokeSheetTabMutationPort(ports: CapturedSheetTabsPorts, plan: SheetTabMutationPlan, revision: ProjectionRevision | undefined): Promise<SheetMutationResult> {
  switch (plan.kind) {
    case 'add': if (!ports.addSheet) throw new Error('Add sheet is unavailable'); return ports.addSheet({ kind: 'add-sheet', name: plan.name, requestId: plan.requestId, revision })
    case 'rename': if (!ports.renameSheet || !plan.sheetId || !plan.name) throw new Error('Rename sheet is unavailable'); return ports.renameSheet({ kind: 'rename-sheet', sheetId: plan.sheetId, name: plan.name, requestId: plan.requestId, revision })
    case 'delete': if (!ports.deleteSheet || !plan.sheetId) throw new Error('Delete sheet is unavailable'); return ports.deleteSheet({ kind: 'delete-sheet', sheetId: plan.sheetId, requestId: plan.requestId, revision })
    case 'reorder': if (!ports.reorderSheet || !plan.sheetId) throw new Error('Reorder sheet is unavailable'); return ports.reorderSheet({ kind: 'reorder-sheet', sheetId: plan.sheetId, beforeSheetId: plan.beforeSheetId, afterSheetId: plan.afterSheetId, targetIndex: plan.targetIndex, requestId: plan.requestId, revision })
  }
}

export function sheetTabMutationResultMatches(result: unknown, plan: SheetTabMutationPlan): result is SheetMutationResult {
  if (typeof result !== 'object' || result === null) return false
  const record = result as Record<string, unknown>
  if (record.requestId !== plan.requestId) return false
  if (plan.kind !== 'add') return record.sheetId === plan.sheetId
  return typeof record.sheetId === 'string' && record.sheetId.length > 0 && (record.createdSheet === undefined || (typeof record.createdSheet === 'object' && record.createdSheet !== null && (record.createdSheet as Record<string, unknown>).id === record.sheetId))
}

export function projectionConfirmsSheetTabMutation(source: readonly SpreadsheetSheetMetadata[], projected: readonly SpreadsheetSheetMetadata[], result: SheetMutationResult, plan: SheetTabMutationPlan): boolean {
  switch (plan.kind) {
    case 'add': return projected.some((sheet) => sheet.id === result.sheetId && (!plan.name || sheet.name === plan.name))
    case 'rename': return projected.some((sheet) => sheet.id === plan.sheetId && sheet.name === plan.name)
    case 'delete': return projected.length > 0 && projected.every((sheet) => sheet.id !== plan.sheetId)
    case 'reorder': {
      if (!plan.sheetId) return false
      const expected = reorderSheetMetadata(source, { sheetId: plan.sheetId, beforeSheetId: plan.beforeSheetId, afterSheetId: plan.afterSheetId, targetIndex: plan.targetIndex }).map((sheet) => sheet.id)
      return expected.length === projected.length && expected.every((id, index) => id === projected[index]?.id)
    }
  }
}

export function mutationStateFromPlan(plan: SheetTabMutationPlan): SheetTabMutationState { return { kind: plan.kind, phase: plan.phase, requestId: plan.requestId, sessionId: plan.sessionId, sheetId: plan.sheetId, activeSheetIdAtDispatch: plan.activeSheetIdAtDispatch } }
export function mutationResultStateFromPlan(plan: SheetTabMutationPlan, outcome: SheetTabMutationOutcome): SheetTabMutationResultState { return { kind: plan.kind, outcome, requestId: plan.requestId, sessionId: plan.sessionId, sheetId: plan.sheetId } }
export function sheetTabMutationIsCurrent(state: SheetTabsState, plan: SheetTabMutationPlan): boolean { return state.sessionId === plan.sessionId && state.mutation?.requestId === plan.requestId && state.mutation.sessionId === plan.sessionId && state.mutation.kind === plan.kind && state.mutation.sheetId === plan.sheetId }
export function settleSheetTabMutation(get: Getter, set: Setter, plan: SheetTabMutationPlan, outcome: Exclude<SheetTabMutationOutcome, 'acknowledged'>, error: string): void {
  const state = get(sheetTabsAtom)
  if (!sheetTabMutationIsCurrent(state, plan)) return
  set(sheetTabsAtom, { ...state, phase: 'ready', mutation: null, lastMutation: mutationResultStateFromPlan(plan, outcome), error })
}
