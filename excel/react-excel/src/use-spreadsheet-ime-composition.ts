import {
  useCallback,
  useRef,
  type CompositionEvent as ReactCompositionEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

export interface UseSpreadsheetImeCompositionOptions {
  /** Commits the current UI-core-owned editing draft after Enter. */
  readonly onCommit: () => void
  /** Cancels the current UI-core-owned editing draft after Escape. */
  readonly onCancel: () => void
}

export interface SpreadsheetImeCompositionHandlers {
  onCompositionStart(event: ReactCompositionEvent<HTMLElement>): void
  onCompositionEnd(event: ReactCompositionEvent<HTMLElement>): void
  onKeyDown(event: ReactKeyboardEvent<HTMLElement>): void
}

/** Prevents editor key bindings from committing or cancelling an active IME composition. */
export function useSpreadsheetImeComposition(
  options: UseSpreadsheetImeCompositionOptions,
): SpreadsheetImeCompositionHandlers {
  const isComposing = useRef(false)
  const { onCancel, onCommit } = options

  const onCompositionStart = useCallback(() => {
    isComposing.current = true
  }, [])
  const onCompositionEnd = useCallback(() => {
    isComposing.current = false
  }, [])
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented || isComposing.current || event.nativeEvent.isComposing) return

      if (event.key === 'Enter') {
        event.preventDefault()
        onCommit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    },
    [onCancel, onCommit],
  )

  return { onCompositionStart, onCompositionEnd, onKeyDown }
}
