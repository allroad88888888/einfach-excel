import {
  dismissFormulaSuggestionsAtom,
  dispatchKeyboardInputAtom,
  editingCommitLifecycleAtom,
  editingDraftAtom,
  editingSessionAtom,
  formulaFunctionSuggestionCursorAtom,
  formulaFunctionSuggestionsAtom,
  formulaReferenceSessionAtom,
} from '@einfach/spreadsheet-ui-core'
import { useAtomValue } from '@einfach/solid'
import { Show } from 'solid-js'
import {
  acceptFormulaSuggestion,
  dispatchEditingCancel,
  notifyDraftTypedChar,
  readActiveFormulaSuggestion,
  syncFormulaReferenceCaret,
} from '../provider'
import { createInputCompositionGuard } from '../i18n-adapter/input-composition'
import { applyFormulaReferenceArrowPick } from './grid-formula-reference-keyboard'
import { type GridRuntime } from './grid-runtime'

interface SpreadsheetGridCellEditorProps {
  runtime: GridRuntime
  editing: () => boolean
}

/** Renders and owns keyboard handling for the active cell input. */
export function SpreadsheetGridCellEditor(props: SpreadsheetGridCellEditorProps) {
  const { runtime } = props
  const { store, editingDraft, commitCellEdit } = runtime
  const composition = createInputCompositionGuard()
  const editingCommitLifecycle = useAtomValue(editingCommitLifecycleAtom)
  const commitRejected = () => editingCommitLifecycle().status === 'rejected'
  return (
    <Show when={props.editing()}>
      <>
        <input
          class="cell-input"
          value={editingDraft()}
          aria-invalid={commitRejected() ? 'true' : undefined}
          aria-errormessage={commitRejected() ? 'spreadsheet-grid-editing-error' : undefined}
          ref={(element) => {
            queueMicrotask(() => {
              if (!element.isConnected) return
              const session = store.getter(editingSessionAtom)
              const ownedByFormulaBar =
                session.status === 'drafting' && session.source?.source === 'formula-bar'
              if (session.status !== 'drafting' || ownedByFormulaBar) return
              element.focus()
              const length = element.value.length
              element.setSelectionRange(length, length)
            })
          }}
          onInput={(event) => {
            store.setter(editingDraftAtom, { draft: event.currentTarget.value })
            notifyDraftTypedChar(
              store,
              event.currentTarget.selectionStart ?? event.currentTarget.value.length,
            )
          }}
          onSelect={(event) => {
            syncFormulaReferenceCaret(store, event.currentTarget.selectionStart ?? 0)
          }}
          onCompositionStart={composition.onCompositionStart}
          onCompositionEnd={composition.onCompositionEnd}
          onKeyUp={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
              syncFormulaReferenceCaret(store, event.currentTarget.selectionStart ?? 0)
            }
          }}
          onKeyDown={(event) => {
            // The browser owns Enter/Escape while an IME composition is active.
            // Treating them as spreadsheet commands here would commit or discard
            // a character that the IME has not finalized yet.
            if (composition.isComposing(event)) return

            const suggestions = store.getter(formulaFunctionSuggestionsAtom)
            if (suggestions.length > 0) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const current = store.getter(formulaFunctionSuggestionCursorAtom)
                const next =
                  event.key === 'ArrowDown'
                    ? (current + 1) % suggestions.length
                    : (current - 1 + suggestions.length) % suggestions.length
                store.setter(formulaFunctionSuggestionCursorAtom, next)
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
                  return
                }
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                store.setter(dismissFormulaSuggestionsAtom)
                store.setter(formulaFunctionSuggestionCursorAtom, 0)
                return
              }
            }
            if (store.getter(formulaReferenceSessionAtom)) {
              const intent = store.setter(dispatchKeyboardInputAtom, {
                key: event.key,
                shiftKey: event.shiftKey,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                altKey: event.altKey,
                isComposing: event.isComposing,
              })
              if (intent.type === 'formulaReference.arrowPick') {
                event.preventDefault()
                applyFormulaReferenceArrowPick(store, intent)
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
              if (dispatchEditingCancel(store)) runtime.focusGrid()
            }
          }}
          onBlur={() => {
            if (composition.reset()) return
            if (store.getter(formulaReferenceSessionAtom)) return
            if (store.getter(editingSessionAtom).status === 'drafting') void commitCellEdit()
          }}
        />
        <Show when={commitRejected()}>
          <span class="cell-edit-error" id="spreadsheet-grid-editing-error" role="alert">
            {editingCommitLifecycle().error}
          </span>
        </Show>
      </>
    </Show>
  )
}
