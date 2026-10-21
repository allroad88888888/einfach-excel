import { atom, type WritableAtom } from '@einfach/core'
import { editingDraftAtom, editingSessionAtom } from '../editing/session-atoms'
import type { EditingSessionState } from '../editing/types'
import { activeEditingCommitTicketAtom } from '../editing/commit-state'
import { formulaReferenceCaretAtom } from '../formula-reference'
import {
  renderFormulaFunctionSignature,
} from './registry'
import { nativeFunctionCatalogAtom } from './native-catalog'
import { searchFormulaFunctions } from './search'
import { findEnclosingFormulaHelpCall, findFunctionNameFragmentAtCaret } from './parse'
import { formulaHelpArgumentIndex, formulaHelpSignatureSlots } from './help/signature'
import type {
  FormulaFunctionSignatureState,
  FormulaFunctionSuggestion,
} from './types'

export * from './registry'
export * from './parse'
export * from './types'
export { formulaHelpArgumentIndex, formulaHelpSignatureSlots } from './help/signature'
export { nativeFunctionCatalogAtom, publishNativeFunctionCatalogAtom } from './native-catalog'

/** Max rows to surface in the dropdown — keeps the UI compact. */
const SUGGESTION_LIMIT = 8

/**
 * Internal source atom: tracks the caret position the user dismissed the
 * suggestions popup from (via Esc). The derived suggestions atom returns
 * empty as long as the live caret matches this remembered position — so
 * `=S` + Esc hides the dropdown, but moving the caret (typing another
 * char, ArrowLeft/Right, mouse re-position) re-opens it.
 *
 * Null means no active dismissal. Hosts call `dismissFormulaSuggestionsAtom`
 * to set it; helpers below clear it on any user-driven caret change.
 */
// 操作只属于当前草稿快照/光标：换字或重新编辑自然恢复默认值，不加 reset 生命周期。
type SuggestionUi = { cursor: number; dismissed: number | null }
const suggestionUiBackingAtom = atom<{
  editing: EditingSessionState
  caret: number
  value: SuggestionUi
} | null>(null)
const suggestionUiAtom: WritableAtom<SuggestionUi, [Partial<SuggestionUi>], void> = atom(
  (get): SuggestionUi => {
    const saved = get(suggestionUiBackingAtom)
    return saved?.editing === get(editingSessionAtom) &&
      saved.caret === get(formulaReferenceCaretAtom)
      ? saved.value
      : { cursor: 0, dismissed: null }
  },
  (get, set, patch: Partial<SuggestionUi>) =>
    set(suggestionUiBackingAtom, {
      editing: get(editingSessionAtom),
      caret: get(formulaReferenceCaretAtom),
      value: { ...get(suggestionUiAtom), ...patch },
    }),
)
export const formulaFunctionSuggestionsDismissedAtCaretAtom = atom(
  (get) => get(suggestionUiAtom).dismissed,
  (_get, set, dismissed: number | null) => set(suggestionUiAtom, { dismissed }),
)
formulaFunctionSuggestionsDismissedAtCaretAtom.debugLabel =
  'spreadsheet.formulaFunctions.dismissedAtCaret'

/**
 * Autocomplete suggestions derived from the editing draft + the live caret
 * tracked in `formulaReferenceCaretAtom`. Returns empty when:
 *   - editing is not drafting
 *   - draft doesn't start with '='
 *   - caret has no function-name fragment to its immediate left
 *   - the fragment has no matching specs
 *   - the user has dismissed the popup at the current caret position
 *     (see `dismissFormulaSuggestionsAtom`)
 *
 * The host renders this as a dropdown anchored to the active input.
 */
export const formulaFunctionSuggestionsAtom = atom<FormulaFunctionSuggestion[]>((get) => {
  const session = get(editingSessionAtom)
  if (session.status !== 'drafting' || get(activeEditingCommitTicketAtom) !== null) return []
  const draft = get(editingDraftAtom)
  if (!draft.startsWith('=')) return []
  const caret = get(formulaReferenceCaretAtom)
  if (caret < 0) return []
  const dismissedAt = get(formulaFunctionSuggestionsDismissedAtCaretAtom)
  if (dismissedAt !== null && dismissedAt === caret) return []
  const fragment = findFunctionNameFragmentAtCaret(draft, caret)
  if (!fragment) return []
  const matches = searchFormulaFunctions(
    fragment.text, get(nativeFunctionCatalogAtom), SUGGESTION_LIMIT,
  )
  return matches.map((spec) => ({
    spec,
    fragmentStart: fragment.start,
    fragmentEnd: fragment.end,
    fragment: fragment.text.toUpperCase(),
  }))
})
formulaFunctionSuggestionsAtom.debugLabel = 'spreadsheet.formulaFunctions.suggestions'

/**
 * Mark the autocomplete popup as dismissed at the current caret. Hosts
 * call this from the input's Esc handler. The popup re-opens automatically
 * once the caret moves to a different position.
 */
export const dismissFormulaSuggestionsAtom = atom(null, (get, set) => {
  const caret = get(formulaReferenceCaretAtom)
  set(formulaFunctionSuggestionsDismissedAtCaretAtom, caret < 0 ? null : caret)
})
dismissFormulaSuggestionsAtom.debugLabel = 'spreadsheet.formulaFunctions.dismiss'

/**
 * Signature state for the caret: when the caret sits inside a known
 * function's open paren, returns the spec + the active arg index. Null
 * otherwise. Used to render the signature tooltip below the input.
 */
export const formulaFunctionSignatureAtom = atom<FormulaFunctionSignatureState | null>((get) => {
  const session = get(editingSessionAtom)
  if (session.status !== 'drafting' || get(activeEditingCommitTicketAtom) !== null) return null
  const draft = get(editingDraftAtom)
  if (!draft.startsWith('=')) return null
  const caret = get(formulaReferenceCaretAtom)
  if (caret < 0) return null
  const enclosing = findEnclosingFormulaHelpCall(draft, caret)
  if (!enclosing) return null
  const spec = get(nativeFunctionCatalogAtom)
    .find((entry) => entry.name === enclosing.name.toUpperCase())
  if (!spec || !spec.signatureAvailable) return null
  const activeArgIndex = formulaHelpArgumentIndex(
    spec, enclosing.activeArgIndex, enclosing.argumentCount, enclosing.firstArgument,
  )
  return { spec, activeArgIndex }
})
formulaFunctionSignatureAtom.debugLabel = 'spreadsheet.formulaFunctions.signature'

/**
 * Currently-selected suggestion index. Keyboard ArrowUp/Down move it;
 * pointer hover sets it; accepting the suggestion (Tab/Enter) reads it.
 * Reset to 0 whenever the suggestions list changes shape.
 */
export const formulaFunctionSuggestionCursorAtom = atom(
  (get) => get(suggestionUiAtom).cursor,
  (_get, set, cursor: number) => set(suggestionUiAtom, { cursor }),
)
formulaFunctionSuggestionCursorAtom.debugLabel = 'spreadsheet.formulaFunctions.cursor'

/**
 * Convenience derived atom — `true` when at least one suggestion exists.
 * Hosts use it to decide whether to intercept ArrowUp/Down/Tab/Enter.
 */
export const formulaFunctionSuggestionsActiveAtom = atom(
  (get) => get(formulaFunctionSuggestionsAtom).length > 0,
)
formulaFunctionSuggestionsActiveAtom.debugLabel = 'spreadsheet.formulaFunctions.suggestionsActive'

/**
 * Per-arg signature rendering. Returns each argument slot with an
 * `active` flag so the UI can wrap the active arg in `<strong>` (or
 * equivalent) without parsing sentinel markers out of a string.
 */
export interface RenderedSignatureSlot {
  text: string
  active: boolean
}

export function renderActiveSignatureSlots(
  state: FormulaFunctionSignatureState,
): RenderedSignatureSlot[] {
  return formulaHelpSignatureSlots(state.spec).map((text, i) => ({
    text, active: i === state.activeArgIndex,
  }))
}

/** Re-export the plain renderer for tests / fallback rendering. */
export { renderFormulaFunctionSignature }
