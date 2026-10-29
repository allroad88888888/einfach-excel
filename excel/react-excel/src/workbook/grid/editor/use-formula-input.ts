import { useAtomValue, useSetAtom } from '@einfach/react'
import { useId, useLayoutEffect, type RefObject, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import {
  formulaReferenceSessionAtom,
  formulaReferenceCaretAtom,
  editingDraftAtom,
  syncFormulaReferenceCaretAtom,
  formulaFunctionSuggestionsAtom,
  formulaFunctionSuggestionCursorAtom,
  dispatchFormulaInputKeyAtom,
  editingSessionAtom,
  formulaFunctionSignatureAtom,
} from '@einfach-excel/spreadsheet-ui-core'

/** React 仅负责 DOM 光标/键盘；补全、引用拼接与 F4 都由 UI Core command atom 决定。 */
export function useFormulaInput(
  ref: RefObject<HTMLTextAreaElement>,
  source: 'cell' | 'formula-bar',
) {
  const listId = useId()
  const reference = useAtomValue(formulaReferenceSessionAtom)
  const caret = useAtomValue(formulaReferenceCaretAtom)
  const draft = useAtomValue(editingDraftAtom)
  const syncCaret = useSetAtom(syncFormulaReferenceCaretAtom)
  const suggestions = useAtomValue(formulaFunctionSuggestionsAtom)
  const cursor = useAtomValue(formulaFunctionSuggestionCursorAtom)
  const session = useAtomValue(editingSessionAtom)
  const signature = useAtomValue(formulaFunctionSignatureAtom)
  const active =
    session.status === 'drafting' &&
    (source === 'formula-bar') === (session.source?.source === 'formula-bar')
  const dispatchKey = useSetAtom(dispatchFormulaInputKeyAtom)
  useLayoutEffect(() => {
    const input = ref.current
    if (input && document.activeElement === input && reference?.tokenRange && caret >= 0)
      input.setSelectionRange(caret, caret)
  }, [ref, reference?.tokenRange, caret, draft])
  return {
    listId,
    activeOption: active && suggestions[cursor] ? `${listId}-${cursor}` : undefined,
    signatureId: active && !suggestions.length && signature ? `${listId}-signature` : undefined,
    onSelect: () => {
      const input = ref.current
      if (input && document.activeElement === input) syncCaret(input.selectionStart)
    },
    onFormulaKey: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const input = event.currentTarget
      let result: { handled: boolean; caret?: number } = { handled: false }
      flushSync(() => {
        result = dispatchKey({
          key: event.key,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          isComposing: event.nativeEvent.isComposing || event.keyCode === 229,
          start: input.selectionStart,
          end: input.selectionEnd,
        })
      })
      if (result.handled) {
        event.preventDefault()
        if (result.caret !== undefined) input.setSelectionRange(result.caret, result.caret)
      }
      return result.handled
    },
  }
}
