import { normalizeCoordinate, normalizeOptionalIndex, normalizeSheetTabDraftName } from './metadata'
import type { BeginSheetTabRenameInput, BeginSheetTabReorderInput, CommitSheetTabRenameInput, CommitSheetTabReorderInput, OpenSheetTabContextMenuInput, SheetTabIntent, SheetTabsState, UpdateSheetTabReorderInput } from './types'

export function createOpenSheetTabContextMenuIntent(input: OpenSheetTabContextMenuInput): SheetTabIntent { return { type: 'sheet-tab.context-menu.open', sheetId: input.sheetId, x: normalizeCoordinate(input.x), y: normalizeCoordinate(input.y), source: input.source ?? 'pointer' } }
export function createCloseSheetTabContextMenuIntent(reason: 'dismissed' | 'sheet-changed' | 'committed' | 'cancelled' = 'dismissed'): SheetTabIntent { return { type: 'sheet-tab.context-menu.close', reason } }
export function createBeginSheetTabRenameIntent(input: BeginSheetTabRenameInput): SheetTabIntent | null { return normalizeSheetTabDraftName(input.draftName) === null ? null : { type: 'sheet-tab.rename.begin', sheetId: input.sheetId, draftName: input.draftName, source: input.source ?? 'programmatic' } }
export function createUpdateSheetTabRenameIntent(sheetId: string, draftName: string): SheetTabIntent | null { return draftName.length === 0 ? null : { type: 'sheet-tab.rename.change', sheetId, draftName } }
export function createCommitSheetTabRenameIntent(input: CommitSheetTabRenameInput): SheetTabIntent | null { const name = normalizeSheetTabDraftName(input.name); return name === null ? null : { type: 'sheet-tab.rename.commit', sheetId: input.sheetId, name, source: input.source ?? 'programmatic' } }
export function createBeginSheetTabReorderIntent(input: BeginSheetTabReorderInput): SheetTabIntent { return { type: 'sheet-tab.reorder.begin', sheetId: input.sheetId, source: input.source ?? 'programmatic' } }
export function createUpdateSheetTabReorderIntent(input: UpdateSheetTabReorderInput): SheetTabIntent { return { type: 'sheet-tab.reorder.update', sheetId: input.sheetId, beforeSheetId: input.beforeSheetId ?? null, afterSheetId: input.afterSheetId ?? null, targetIndex: normalizeOptionalIndex(input.targetIndex ?? null) } }
export function createCommitSheetTabReorderIntent(input: CommitSheetTabReorderInput): SheetTabIntent { return { type: 'sheet-tab.reorder.commit', sheetId: input.sheetId, beforeSheetId: input.beforeSheetId ?? null, afterSheetId: input.afterSheetId ?? null, targetIndex: normalizeOptionalIndex(input.targetIndex ?? null) } }
export function createCancelSheetTabRenameIntent(sheetId: string, reason: 'escape' | 'blur' | 'sheet-changed'): SheetTabIntent { return { type: 'sheet-tab.rename.cancel', sheetId, reason } }
export function createCancelSheetTabReorderIntent(sheetId: string, reason: 'escape' | 'blur' | 'sheet-changed'): SheetTabIntent { return { type: 'sheet-tab.reorder.cancel', sheetId, reason } }

export function applySheetTabIntent(state: SheetTabsState, intent: SheetTabIntent): SheetTabsState {
  switch (intent.type) {
    case 'sheet-tab.context-menu.open': return { ...state, contextMenu: { sheetId: intent.sheetId, x: intent.x, y: intent.y, source: intent.source }, lastIntent: intent }
    case 'sheet-tab.context-menu.close': return { ...state, contextMenu: null, lastIntent: intent }
    case 'sheet-tab.rename.begin': return { ...state, rename: { sheetId: intent.sheetId, draftName: intent.draftName, source: intent.source }, lastIntent: intent }
    case 'sheet-tab.rename.change': return state.rename === null || state.rename.sheetId !== intent.sheetId ? state : { ...state, rename: { ...state.rename, draftName: intent.draftName }, lastIntent: intent }
    case 'sheet-tab.rename.commit': return state.rename === null || state.rename.sheetId !== intent.sheetId ? state : { ...state, rename: null, contextMenu: null, lastIntent: intent }
    case 'sheet-tab.rename.cancel': return state.rename === null || state.rename.sheetId !== intent.sheetId ? state : { ...state, rename: null, lastIntent: intent }
    case 'sheet-tab.reorder.begin': return { ...state, reorder: { sheetId: intent.sheetId, beforeSheetId: null, afterSheetId: null, targetIndex: null, source: intent.source }, lastIntent: intent }
    case 'sheet-tab.reorder.update': return state.reorder === null || state.reorder.sheetId !== intent.sheetId ? state : { ...state, reorder: { ...state.reorder, beforeSheetId: intent.beforeSheetId, afterSheetId: intent.afterSheetId, targetIndex: intent.targetIndex }, lastIntent: intent }
    case 'sheet-tab.reorder.commit': return state.reorder === null || state.reorder.sheetId !== intent.sheetId ? state : { ...state, reorder: null, lastIntent: intent }
    case 'sheet-tab.reorder.cancel': return state.reorder === null || state.reorder.sheetId !== intent.sheetId ? state : { ...state, reorder: null, lastIntent: intent }
  }
}
