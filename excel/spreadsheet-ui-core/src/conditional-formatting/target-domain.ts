import type { Getter } from '@einfach/core'
import {
  selectionAuthorityWitnessAtom,
  selectionSnapshotAtom,
  type SelectionAuthorityWitness,
} from '../selection'
import {
  workspaceActiveSheetAuthorityWitnessAtom,
  workspaceSessionAtom,
  type WorkspaceActiveSheetAuthorityWitness,
} from '../workspace'
import type { ScopeTargetSource, SheetTargetSource } from './mutation-types'
import { isObjectRecord, snapshotRange } from './snapshot-format'
import type { ConditionalFormatEditorState, ConditionalFormatRulesState, ConditionalFormatScope } from './types'
import { freezeScope } from './value-domain'

export function resolveSheetTarget(
  get: Getter,
  explicitSheetId: string | undefined,
  cache: ConditionalFormatRulesState,
): { readonly sheetId: string; readonly source: SheetTargetSource; readonly authorityWitness: WorkspaceActiveSheetAuthorityWitness | null } | null {
  if (explicitSheetId !== undefined) return { sheetId: explicitSheetId, source: 'explicit', authorityWitness: null }
  try {
    const authorityWitness = get(workspaceActiveSheetAuthorityWitnessAtom)
    const workspace = get(workspaceSessionAtom)
    if (!isObjectRecord(workspace)) return null
    const activeSheetId = workspace.activeSheetId
    if (get(workspaceActiveSheetAuthorityWitnessAtom) !== authorityWitness) return null
    if (activeSheetId !== null && typeof activeSheetId !== 'string') return null
    return {
      sheetId: typeof activeSheetId === 'string' && activeSheetId.length > 0 ? activeSheetId : (cache.sheetId ?? ''),
      source: 'workspace-or-cache',
      authorityWitness,
    }
  } catch { return null }
}

export function resolveScopeTarget(
  get: Getter,
  explicitScope: ConditionalFormatScope | undefined,
  editor: ConditionalFormatEditorState,
): { readonly scope: ConditionalFormatScope; readonly source: ScopeTargetSource; readonly authorityWitness: SelectionAuthorityWitness | null } | null {
  if (explicitScope !== undefined) return { scope: freezeScope(explicitScope), source: 'explicit', authorityWitness: null }
  if (editor.draft !== null) return { scope: freezeScope(editor.draft.scope), source: 'draft', authorityWitness: null }
  try {
    const authorityWitness = get(selectionAuthorityWitnessAtom)
    const selection = get(selectionSnapshotAtom)
    if (!isObjectRecord(selection)) return null
    const range = snapshotRange(selection.range)
    if (get(selectionAuthorityWitnessAtom) !== authorityWitness) return null
    return range === null ? null : { scope: freezeScope({ range }), source: 'selection', authorityWitness }
  } catch { return null }
}

export function resolvedTargetAuthorityIsCurrent(
  get: Getter,
  sheetTarget: { readonly authorityWitness: WorkspaceActiveSheetAuthorityWitness | null },
  scopeTarget: { readonly authorityWitness: SelectionAuthorityWitness | null },
): boolean {
  try {
    return (sheetTarget.authorityWitness === null || get(workspaceActiveSheetAuthorityWitnessAtom) === sheetTarget.authorityWitness) && (scopeTarget.authorityWitness === null || get(selectionAuthorityWitnessAtom) === scopeTarget.authorityWitness)
  } catch { return false }
}
