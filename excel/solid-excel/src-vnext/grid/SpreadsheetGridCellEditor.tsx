import {
  dismissFormulaSuggestionsAtom,
  editingDraftAtom,
  editingSessionAtom,
  formulaFunctionSuggestionCursorAtom,
  formulaFunctionSuggestionsAtom,
  formulaReferenceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import { Show } from 'solid-js'
import {
  acceptFormulaSuggestion,
  dispatchEditingCancel,
  notifyDraftTypedChar,
  readActiveFormulaSuggestion,
  syncFormulaReferenceCaret,
} from '../provider'
import { type GridRuntime } from './grid-runtime'

interface SpreadsheetGridCellEditorProps {
  runtime: GridRuntime
  editing: () => boolean
}

/** Renders and owns keyboard handling for the active cell input. */
export function SpreadsheetGridCellEditor(props: SpreadsheetGridCellEditorProps) {
  const { runtime } = props
  const { store, editingDraft, bumpRender, commitCellEdit } = runtime
  return (
    <Show when={props.editing()}>
      <input
        class="cell-input"
        value={editingDraft()}
        ref={(element) => {
          queueMicrotask(() => {
            const session = store.getter(editingSessionAtom)
            const ownedByFormulaBar = session.status === 'drafting' && session.source?.source === 'formula-bar'
            if (ownedByFormulaBar) return
            element.focus()
            const length = element.value.length
            element.setSelectionRange(length, length)
          })
        }}
        onInput={(event) => {
          store.setter(editingDraftAtom, { draft: event.currentTarget.value })
          notifyDraftTypedChar(store, event.currentTarget.selectionStart ?? event.currentTarget.value.length)
          bumpRender()
        }}
        onSelect={(event) => {
          syncFormulaReferenceCaret(store, event.currentTarget.selectionStart ?? 0)
        }}
        onKeyUp={(event) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            syncFormulaReferenceCaret(store, event.currentTarget.selectionStart ?? 0)
          }
        }}
        onKeyDown={(event) => {
          const suggestions = store.getter(formulaFunctionSuggestionsAtom)
          if (suggestions.length > 0) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const current = store.getter(formulaFunctionSuggestionCursorAtom)
              const next = event.key === 'ArrowDown' ? (current + 1) % suggestions.length : (current - 1 + suggestions.length) % suggestions.length
              store.setter(formulaFunctionSuggestionCursorAtom, next)
              bumpRender()
              return
            }
            if (event.key === 'Tab' || event.key === 'Enter') {
              const suggestion = readActiveFormulaSuggestion(store)
              if (suggestion) {
                event.preventDefault()
                const input = event.currentTarget
                const { caret } = acceptFormulaSuggestion(store, suggestion)
                queueMicrotask(() => {
                  input.focus()
                  input.setSelectionRange(caret, caret)
                })
                bumpRender()
                return
              }
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              store.setter(dismissFormulaSuggestionsAtom)
              store.setter(formulaFunctionSuggestionCursorAtom, 0)
              bumpRender()
              return
            }
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            void commitCellEdit(event.shiftKey ? 'up' : 'down')
          } else if (event.key === 'Tab') {
            event.preventDefault()
            void commitCellEdit(event.shiftKey ? 'left' : 'right')
          } else if (event.key === 'Escape') {
            event.preventDefault()
            dispatchEditingCancel(store)
            bumpRender()
          }
        }}
        onBlur={() => {
          if (store.getter(formulaReferenceSessionAtom)) return
          if (store.getter(editingSessionAtom).status === 'drafting') void commitCellEdit()
        }}
      />
    </Show>
  )
}
