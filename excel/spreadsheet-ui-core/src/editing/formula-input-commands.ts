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
  parseFormulaReferences,
} from '../formula-reference'
import { moveFormulaReferenceAtom } from '../formula-reference/arrow-pick'
import { toggleFormulaReferenceAtom } from '../formula-reference/toggle-reference'
import {
  formulaReferenceSessionBackingAtom,
  formulaReferenceTextOnlyAtom,
} from '../formula-reference/state'
import type { KeyboardInput } from '../keyboard'
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
  if (get(formulaReferenceTextOnlyAtom)) return
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

/** F2 只切换草稿的操作方式；已有引用从当前位置继续，选中文字可被新引用替换。 */
const toggleFormulaInputModeAtom = atom(null, (get, set, range: { start: number; end: number }) => {
  const editing = get(editingSessionAtom)
  if (
    !editing.source ||
    !editing.draft.startsWith('=') ||
    get(activeEditingCommitTicketAtom) !== null
  )
    return { handled: false }
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 1 ||
    range.start > range.end ||
    range.end > editing.draft.length
  )
    return { handled: false }
  if (get(formulaReferenceSessionAtom)) {
    set(formulaReferenceTextOnlyAtom, true)
    set(exitFormulaReferenceAtom, 'type-after-pick')
    return { handled: true }
  }
  const token = parseFormulaReferences(editing.draft, editing.source.sheetId).find(
    (item) => !item.text.includes('!') && item.start <= range.start && range.end <= item.end,
  )
  const start = token?.start ?? range.start
  const end = token?.end ?? range.end
  set(formulaReferenceTextOnlyAtom, false)
  set(enterFormulaReferenceAtom, {
    anchorCell: editing.source.cell,
    sheetId: editing.source.sheetId,
    insertionCaret: start,
    draft: editing.draft,
  })
  const reference = get(formulaReferenceSessionAtom)!
  set(formulaReferenceSessionBackingAtom, {
    ...reference,
    tokenRange: start < end ? { start, end } : null,
    pickAnchor: token ? { row: token.range.rowStart, col: token.range.colStart } : null,
    pickFocus: token ? { row: token.range.rowEnd, col: token.range.colEnd } : null,
  })
  set(setFormulaReferenceCaretAtom, end)
  return { handled: true, caret: end }
})

/** 两个输入入口共用优先级：补全列表 → 引用快捷键 → 浏览器文字光标/原提交命令。 */
export const dispatchFormulaInputKeyAtom = atom(
  null,
  (
    get,
    set,
    input: KeyboardInput & { start: number; end: number },
  ): { handled: boolean; caret?: number } => {
    if (
      input.isComposing ||
      input.altKey ||
      input.ctrlKey ||
      input.metaKey ||
      get(activeEditingCommitTicketAtom) !== null
    )
      return { handled: false }
    if (!input.shiftKey) {
      const suggestion = set(dispatchFormulaSuggestionKeyAtom, input.key)
      if (suggestion.handled) return suggestion
    }
    if (input.key === 'F2' && !input.shiftKey) return set(toggleFormulaInputModeAtom, input)
    if (input.key === 'F4') {
      const caret = set(toggleFormulaReferenceAtom, input)
      return caret === null ? { handled: true } : { handled: true, caret }
    }
    const caret = set(moveFormulaReferenceAtom, input)
    return caret === null ? { handled: false } : { handled: true, caret }
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
