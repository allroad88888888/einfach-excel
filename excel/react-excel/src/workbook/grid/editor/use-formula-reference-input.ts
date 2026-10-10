import { useAtomValue, useSetAtom } from '@einfach/react'
import { useLayoutEffect, type RefObject, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import {
  formulaReferenceSessionAtom, formulaReferenceCaretAtom, editingDraftAtom,
  syncFormulaReferenceCaretAtom, toggleFormulaReferenceAtom,
} from '@einfach/spreadsheet-ui-core'

/** React 仅负责 DOM 光标；引用拼接与 F4 都由 UI Core command atom 决定。 */
export function useFormulaReferenceInput(ref: RefObject<HTMLTextAreaElement>) {
  const reference = useAtomValue(formulaReferenceSessionAtom)
  const caret = useAtomValue(formulaReferenceCaretAtom)
  const draft = useAtomValue(editingDraftAtom)
  const syncCaret = useSetAtom(syncFormulaReferenceCaretAtom)
  const toggle = useSetAtom(toggleFormulaReferenceAtom)
  useLayoutEffect(() => {
    const input = ref.current
    if (input && document.activeElement === input && reference?.tokenRange && caret >= 0)
      input.setSelectionRange(caret, caret)
  }, [ref, reference?.tokenRange, caret, draft])
  return {
    onSelect: () => {
      const input = ref.current
      if (input && document.activeElement === input) syncCaret(input.selectionStart)
    },
    onReferenceKey: (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'F4' || event.altKey || event.ctrlKey || event.metaKey ||
        event.nativeEvent.isComposing || event.keyCode === 229) return false
      event.preventDefault()
      const input = event.currentTarget
      let end: number | null = null
      flushSync(() => { end = toggle({ start: input.selectionStart, end: input.selectionEnd }) })
      if (end !== null) input.setSelectionRange(end, end)
      return true
    },
  }
}
