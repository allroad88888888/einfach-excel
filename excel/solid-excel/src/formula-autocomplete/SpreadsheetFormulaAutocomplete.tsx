import { useAtomValue } from '@einfach/solid'
import {
  editingDraftAtom,
  editingSessionAtom,
  formulaFunctionSignatureAtom,
  formulaFunctionSuggestionCursorAtom,
  formulaFunctionSuggestionsAtom,
  renderActiveSignatureSlots,
  type FormulaFunctionSuggestion,
} from '@einfach/spreadsheet-ui-core'
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js'
import {
  readFormulaAutocompleteAnchor,
  type FormulaAutocompleteAnchor,
} from './formula-autocomplete-anchor'
import { useSpreadsheetUiStore } from '../provider'

/**
 * Autocomplete + signature overlay anchored to whichever editing input
 * currently has focus (in-cell editor or formula bar). Atom-backed formula
 * data drives visibility; Solid keeps only the DOM anchor as temporary state.
 *
 * Layout: a small popover positioned below the input rect with
 *   1) a list of fuzzy-matched function names (suggestions atom)
 *   2) a thin signature strip with the active arg in bold
 *
 * Pointer hover updates the cursor atom; clicking a row delegates acceptance
 * to the focused editor host, which also owns keyboard routing and focus restore.
 */

export interface SpreadsheetFormulaAutocompleteProps {
  'data-testid'?: string
  /**
   * Hook fired when the user clicks a suggestion. Hosts apply the
   * splice + caret move; we keep it as a prop because the editing-input
   * focus restore logic lives in the host's edit-dispatch helpers.
   */
  onAccept?: (suggestion: FormulaFunctionSuggestion) => void
}

export function SpreadsheetFormulaAutocomplete(props: SpreadsheetFormulaAutocompleteProps) {
  const store = useSpreadsheetUiStore()
  const suggestions = useAtomValue(formulaFunctionSuggestionsAtom)
  const cursor = useAtomValue(formulaFunctionSuggestionCursorAtom)
  const signature = useAtomValue(formulaFunctionSignatureAtom)
  const editing = useAtomValue(editingSessionAtom)

  const [anchor, setAnchor] = createSignal<FormulaAutocompleteAnchor | null>(null)

  const reposition = () => {
    const activeElement = typeof document === 'undefined' ? null : document.activeElement
    setAnchor(readFormulaAutocompleteAnchor(activeElement))
  }

  // Formula atoms re-measure after a draft update; DOM events below keep the
  // temporary anchor correct when focus or viewport geometry changes.
  const editingDraft = useAtomValue(editingDraftAtom)
  createEffect(() => {
    editingDraft()
    suggestions()
    signature()
    // Defer to the microtask queue so the editing input has had a chance
    // to mount before we measure.
    queueMicrotask(reposition)
  })

  // Keep the cursor in bounds when suggestions length shrinks.
  createEffect(() => {
    const list = suggestions()
    if (list.length === 0) {
      if (store.getter(formulaFunctionSuggestionCursorAtom) !== 0) {
        store.setter(formulaFunctionSuggestionCursorAtom, 0)
      }
      return
    }
    const current = store.getter(formulaFunctionSuggestionCursorAtom)
    if (current >= list.length) {
      store.setter(formulaFunctionSuggestionCursorAtom, list.length - 1)
    }
    if (current < 0) {
      store.setter(formulaFunctionSuggestionCursorAtom, 0)
    }
  })

  onMount(() => {
    const refreshAfterFocusChange = () => queueMicrotask(reposition)
    const refreshFromFocusTarget = (event: FocusEvent) => {
      setAnchor(readFormulaAutocompleteAnchor(event.target))
    }

    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, { capture: true })
    document.addEventListener('focusin', refreshFromFocusTarget, true)
    document.addEventListener('focusout', refreshAfterFocusChange, true)
    onCleanup(() => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      document.removeEventListener('focusin', refreshFromFocusTarget, true)
      document.removeEventListener('focusout', refreshAfterFocusChange, true)
    })
  })

  const isDrafting = createMemo(() => editing().status === 'drafting')
  const hasSuggestions = createMemo(() => isDrafting() && suggestions().length > 0)
  const hasSignature = createMemo(() => isDrafting() && signature() !== null)
  const visible = createMemo(() => (hasSuggestions() || hasSignature()) && anchor() !== null)

  const overlayStyle = () => {
    const a = anchor()
    if (!a) return { display: 'none' }
    return {
      position: 'fixed' as const,
      left: `${a.left}px`,
      top: `${a.bottom + 4}px`,
      'min-width': `${Math.max(a.width, 220)}px`,
      'z-index': 1200,
    }
  }

  return (
    <Show when={visible()}>
      <div
        class="spreadsheet-formula-autocomplete"
        data-testid={props['data-testid'] ?? 'formula-autocomplete'}
        style={overlayStyle()}
      >
        <Show when={hasSuggestions()}>
          <ul
            class="spreadsheet-formula-autocomplete-list"
            role="listbox"
            aria-label="Function suggestions"
            data-testid="formula-autocomplete-list"
          >
            <For each={suggestions()}>
              {(suggestion, index) => (
                <li
                  role="option"
                  data-testid={`formula-autocomplete-row-${suggestion.spec.name}`}
                  aria-selected={index() === cursor()}
                  class={`spreadsheet-formula-autocomplete-row ${
                    index() === cursor() ? 'spreadsheet-formula-autocomplete-row-active' : ''
                  }`}
                  onPointerEnter={() => store.setter(formulaFunctionSuggestionCursorAtom, index())}
                  onMouseDown={(event) => {
                    // mousedown (not click) so the input doesn't blur
                    // before the host's accept handler can splice.
                    event.preventDefault()
                    props.onAccept?.(suggestion)
                  }}
                >
                  <span class="spreadsheet-formula-autocomplete-name">{suggestion.spec.name}</span>
                  <span class="spreadsheet-formula-autocomplete-summary">
                    {suggestion.spec.summary}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={hasSignature()}>
          {(_) => {
            const slots = createMemo(() => {
              const state = signature()
              return state ? renderActiveSignatureSlots(state) : []
            })
            const fnName = createMemo(() => signature()?.spec.name ?? '')
            return (
              <div
                class="spreadsheet-formula-autocomplete-signature"
                data-testid="formula-autocomplete-signature"
              >
                <span class="spreadsheet-formula-autocomplete-signature-name">{fnName()}</span>
                <span class="spreadsheet-formula-autocomplete-signature-paren">(</span>
                <For each={slots()}>
                  {(slot, i) => (
                    <>
                      <Show when={i() > 0}>
                        <span class="spreadsheet-formula-autocomplete-signature-comma">, </span>
                      </Show>
                      <span
                        class={
                          slot.active
                            ? 'spreadsheet-formula-autocomplete-signature-arg-active'
                            : 'spreadsheet-formula-autocomplete-signature-arg'
                        }
                      >
                        {slot.text}
                      </span>
                    </>
                  )}
                </For>
                <span class="spreadsheet-formula-autocomplete-signature-paren">)</span>
              </div>
            )
          }}
        </Show>
      </div>
    </Show>
  )
}
