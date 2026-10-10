import { atom, type Store } from '@einfach/core'
import {
  formulaFunctionSuggestionCursorAtom,
  formulaFunctionSuggestionsAtom,
  dismissFormulaSuggestionsAtom,
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
    anchorCell: session.source.cell,
    sheetId: session.source.sheetId,
    insertionCaret: caret,
    draft: session.draft,
  })
})

/** 一次文本输入同时更新草稿与引用位置；React 不串联业务状态。 */
export const updateFormulaDraftAtom = atom(
  null,
  (get, set, input: EditingDraftInput & { caret: number }) => {
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

/** 接受仍在当前候选列表里的函数，直接复用草稿命令，不提交工作簿。 */
export const acceptFormulaSuggestionAtom = atom(null, (get, set, name?: string): number | null => {
  const suggestions = get(formulaFunctionSuggestionsAtom)
  const cursor = Math.max(
    0,
    Math.min(get(formulaFunctionSuggestionCursorAtom), suggestions.length - 1),
  )
  const suggestion = name
    ? suggestions.find((item) => item.spec.name === name)
    : suggestions[cursor]
  if (!suggestion) return null
  const draft = get(editingDraftAtom)
  const replacement = `${suggestion.spec.name}(`
  const next =
    draft.slice(0, suggestion.fragmentStart) + replacement + draft.slice(suggestion.fragmentEnd)
  const caret = suggestion.fragmentStart + replacement.length
  set(updateFormulaDraftAtom, { draft: next, caret })
  return caret
})

/** 结果只告诉 React 是否拦键、是否需要移动 DOM 光标。 */
export const dispatchFormulaSuggestionKeyAtom = atom(
  null,
  (get, set, key: string): { handled: boolean; caret?: number } => {
    const suggestions = get(formulaFunctionSuggestionsAtom)
    if (!suggestions.length) return { handled: false }
    if (key === 'Escape') set(dismissFormulaSuggestionsAtom)
    else if (key === 'ArrowDown' || key === 'ArrowUp') {
      const cursor = get(formulaFunctionSuggestionCursorAtom)
      const delta = key === 'ArrowDown' ? 1 : -1
      set(
        formulaFunctionSuggestionCursorAtom,
        (cursor + delta + suggestions.length) % suggestions.length,
      )
    } else if (key === 'Tab' || key === 'Enter') {
      const caret = set(acceptFormulaSuggestionAtom)
      return caret === null ? { handled: false } : { handled: true, caret }
    } else return { handled: false }
    return { handled: true }
  },
)

/** 旧 Store 调用复用同一 command；React 只使用 useSetAtom。 */
export function acceptFormulaSuggestion(
  store: Store,
  suggestion: FormulaFunctionSuggestion,
): { draft: string; caret: number } {
  const caret = store.setter(acceptFormulaSuggestionAtom, suggestion.spec.name)
  return { draft: store.getter(editingDraftAtom), caret: caret ?? suggestion.fragmentEnd }
}

/** Reads the highlighted formula-function suggestion, if one exists. */
export function readActiveFormulaSuggestion(store: Store): FormulaFunctionSuggestion | null {
  const suggestions = store.getter(formulaFunctionSuggestionsAtom)
  if (suggestions.length === 0) return null
  const cursor = store.getter(formulaFunctionSuggestionCursorAtom)
  return suggestions[Math.max(0, Math.min(cursor, suggestions.length - 1))] ?? null
}
