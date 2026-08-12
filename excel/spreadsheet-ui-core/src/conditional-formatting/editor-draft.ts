import { atom, type Atom, type Getter } from '@einfach/core'
import { selectionSnapshotAtom } from '../selection'
import { workspaceSessionAtom } from '../workspace'
import { isObjectRecord, snapshotScope } from './snapshot-format'
import { snapshotRule } from './snapshot-rules'
import { conditionalFormatEditorStateAtom, conditionalFormatRulesCacheStateAtom } from './state'
import type { ConditionalFormatEditorDraft, ConditionalFormatScope } from './types'
import { freezeEditorState } from './value-domain'

export type ConditionalFormatEditorDraftUpdate =
  | { readonly kind: 'scope'; readonly scope: unknown }
  | { readonly kind: 'priority'; readonly priority: unknown }
  | { readonly kind: 'rule'; readonly rule: unknown }

function snapshotEditableScope(value: unknown): ConditionalFormatScope | null {
  if (!isObjectRecord(value) || !isObjectRecord(value.range)) return null
  const { rowStart, rowEnd, colStart, colEnd } = value.range
  if (
    typeof rowStart !== 'number' ||
    !Number.isSafeInteger(rowStart) ||
    typeof rowEnd !== 'number' ||
    !Number.isSafeInteger(rowEnd) ||
    typeof colStart !== 'number' ||
    !Number.isSafeInteger(colStart) ||
    typeof colEnd !== 'number' ||
    !Number.isSafeInteger(colEnd)
  )
    return null
  return { range: { rowStart, rowEnd, colStart, colEnd } }
}

function snapshotEditablePriority(value: unknown): number | null | undefined {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function editorOwnsCurrentSheet(
  get: Getter,
  editor: { readonly open: boolean; readonly pending: boolean; readonly sheetId: string | null },
): boolean {
  if (!editor.open || editor.pending || editor.sheetId === null) return false
  try {
    const workspace = get(workspaceSessionAtom)
    const cache = get(conditionalFormatRulesCacheStateAtom)
    return workspace.activeSheetId === editor.sheetId && cache.sheetId === editor.sheetId
  } catch {
    return false
  }
}

/** Returns a displayable error without narrowing what persisted snapshots can hydrate. */
export function conditionalFormatEditorDraftError(
  draft: ConditionalFormatEditorDraft | null,
): string | null {
  if (draft === null) return 'Conditional formatting draft is unavailable'
  if (draft.scope !== null && snapshotScope(draft.scope) === null)
    return 'Conditional formatting range must use ordered non-negative cell indexes'
  if (draft.priority !== null && (!Number.isSafeInteger(draft.priority) || draft.priority < 0))
    return 'Conditional formatting priority must be a non-negative whole number'
  const rule = snapshotRule(draft.rule)
  if (rule === null) return 'Conditional formatting rule values are invalid'
  switch (rule.kind) {
    case 'cell-value':
      return (rule.operator === 'between' || rule.operator === 'not-between') &&
        rule.value2 === undefined
        ? 'Between rules require a second comparison value'
        : null
    case 'formula':
      return rule.formula.trim().length === 0 ? 'Formula rules require a formula' : null
    case 'top-bottom':
      return Number.isSafeInteger(rule.count) && rule.count > 0
        ? null
        : 'Top and bottom rules require a positive whole-number count'
    case 'data-bar':
    case 'color-scale':
      return null
  }
}

export const conditionalFormatEditorValidationAtom: Atom<string | null> = atom((get) => {
  const editor = get(conditionalFormatEditorStateAtom)
  return editor.open ? conditionalFormatEditorDraftError(editor.draft) : null
})
conditionalFormatEditorValidationAtom.debugLabel = 'spreadsheet.conditionalFormat.editorValidation'

export const updateConditionalFormatEditorDraftAtom = atom(
  null,
  (get, set, update: ConditionalFormatEditorDraftUpdate): void => {
    const editor = get(conditionalFormatEditorStateAtom)
    if (!editorOwnsCurrentSheet(get, editor) || editor.draft === null) return
    let draft: ConditionalFormatEditorDraft | null = null
    switch (update.kind) {
      case 'scope': {
        const scope = snapshotEditableScope(update.scope)
        if (scope !== null) draft = { ...editor.draft, scope }
        break
      }
      case 'priority': {
        const priority = snapshotEditablePriority(update.priority)
        if (priority !== undefined) draft = { ...editor.draft, priority }
        break
      }
      case 'rule': {
        const rule = snapshotRule(update.rule)
        if (rule !== null) draft = { ...editor.draft, rule }
        break
      }
    }
    if (draft === null || get(conditionalFormatEditorStateAtom) !== editor) return
    set(conditionalFormatEditorStateAtom, freezeEditorState({ ...editor, draft, error: null }))
  },
)
updateConditionalFormatEditorDraftAtom.debugLabel =
  'spreadsheet.conditionalFormat.updateEditorDraft'

export const useSelectionForConditionalFormatEditorScopeAtom = atom(null, (get, set): void => {
  const editor = get(conditionalFormatEditorStateAtom)
  if (!editorOwnsCurrentSheet(get, editor) || editor.draft === null) return
  try {
    const selection = get(selectionSnapshotAtom)
    if (selection.selection.sheetId !== editor.sheetId) return
    const scope = snapshotEditableScope({ range: selection.range })
    if (scope === null || get(conditionalFormatEditorStateAtom) !== editor) return
    set(
      conditionalFormatEditorStateAtom,
      freezeEditorState({ ...editor, draft: { ...editor.draft, scope }, error: null }),
    )
  } catch {
    // Selection is an optional input source; a missing snapshot is not a state transition.
  }
})
useSelectionForConditionalFormatEditorScopeAtom.debugLabel =
  'spreadsheet.conditionalFormat.useSelectionForEditorScope'
