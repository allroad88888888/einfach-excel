import { atom, type Store } from '@einfach/core'
import {
  formulaFunctionSuggestionCursorAtom,
  formulaFunctionSuggestionsAtom,
  type FormulaFunctionSuggestion,
} from '../formula-functions'
import {
  enterFormulaReferenceAtom,
  exitFormulaReferenceAtom,
  formulaReferenceSessionAtom,
  setFormulaReferenceCaretAtom,
  shouldEnterFormulaReferenceMode,
} from '../formula-reference'
import { editingDraftAtom, editingSessionAtom } from './session-atoms'
import type { EditingDraftInput } from './types'
import { activeEditingCommitTicketAtom } from './commit-state'

/** 光标只是一份 UI 状态；手动移走光标才结束当前拾取，不影响工作簿选区。 */
export const syncFormulaReferenceCaretAtom = atom(null, (get, set, caret: number) => {
  if (get(activeEditingCommitTicketAtom) !== null) return
  set(setFormulaReferenceCaretAtom, caret)
  const session = get(editingSessionAtom)
  if (session.status !== 'drafting' || !session.source) return
  const reference = get(formulaReferenceSessionAtom)
  if (reference && caret === (reference.tokenRange?.end ?? reference.insertionCaret)) return
  if (reference) set(exitFormulaReferenceAtom, 'type-after-pick')
  if (!shouldEnterFormulaReferenceMode(session.draft, caret)) return
  set(enterFormulaReferenceAtom, {
    anchorCell: session.source.cell, sheetId: session.source.sheetId,
    insertionCaret: caret, draft: session.draft,
  })
})

/** 一次文本输入同时更新草稿与引用位置；React 不串联业务状态。 */
export const updateFormulaDraftAtom = atom(
  null, (get, set, input: EditingDraftInput & { caret: number }) => {
    if (get(activeEditingCommitTicketAtom) !== null) return
    set(exitFormulaReferenceAtom, 'type-after-pick')
    set(editingDraftAtom, input)
    set(syncFormulaReferenceCaretAtom, input.caret)
  },
)

/** Synchronizes an editing input caret with formula-reference state. */
export function syncFormulaReferenceCaret(store: Store, caret: number): void {
  store.setter(syncFormulaReferenceCaretAtom, caret)
}

/** Re-evaluates formula-reference picking after the user types in a draft. */
export function notifyDraftTypedChar(store: Store, caret: number): void {
  if (store.getter(formulaReferenceSessionAtom) !== null) {
    store.setter(exitFormulaReferenceAtom, 'type-after-pick')
  }
  syncFormulaReferenceCaret(store, caret)
}

/** Inserts a formula-function suggestion into the editing draft. */
export function acceptFormulaSuggestion(
  store: Store,
  suggestion: FormulaFunctionSuggestion,
): { draft: string; caret: number } {
  const draft = store.getter(editingDraftAtom)
  const replacement = `${suggestion.spec.name}(`
  const next =
    draft.slice(0, suggestion.fragmentStart) + replacement + draft.slice(suggestion.fragmentEnd)
  const caret = suggestion.fragmentStart + replacement.length
  store.setter(editingDraftAtom, { draft: next })
  store.setter(formulaFunctionSuggestionCursorAtom, 0)
  notifyDraftTypedChar(store, caret)
  return { draft: next, caret }
}

/** Reads the highlighted formula-function suggestion, if one exists. */
export function readActiveFormulaSuggestion(store: Store): FormulaFunctionSuggestion | null {
  const suggestions = store.getter(formulaFunctionSuggestionsAtom)
  if (suggestions.length === 0) return null
  const cursor = store.getter(formulaFunctionSuggestionCursorAtom)
  return suggestions[Math.max(0, Math.min(cursor, suggestions.length - 1))] ?? null
}
