import type { Store } from '@einfach/core'
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
import { editingDraftAtom, editingSessionAtom } from './index'

/** Synchronizes an editing input caret with formula-reference state. */
export function syncFormulaReferenceCaret(store: Store, caret: number): void {
  store.setter(setFormulaReferenceCaretAtom, caret)
  const session = store.getter(editingSessionAtom)
  if (session.status !== 'drafting' || !session.source) return
  const draft = store.getter(editingDraftAtom)
  if (store.getter(formulaReferenceSessionAtom) !== null) return
  if (!shouldEnterFormulaReferenceMode(draft, caret)) return
  store.setter(enterFormulaReferenceAtom, {
    anchorCell: session.source.cell,
    sheetId: session.source.sheetId,
    insertionCaret: caret,
    draft,
  })
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
