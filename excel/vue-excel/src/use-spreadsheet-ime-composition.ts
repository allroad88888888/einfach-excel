export interface UseSpreadsheetImeCompositionOptions {
  /** Commits the current UI-core-owned editing draft after Enter. */
  readonly onCommit: () => void
  /** Cancels the current UI-core-owned editing draft after Escape. */
  readonly onCancel: () => void
}

/** Native event handlers that protect an active IME composition. */
export interface SpreadsheetImeCompositionHandlers {
  onCompositionstart: () => void
  onCompositionend: () => void
  onKeydown: (event: KeyboardEvent) => void
}

/** Prevents editor key bindings from committing or cancelling an active IME composition. */
export function useSpreadsheetImeComposition(
  options: UseSpreadsheetImeCompositionOptions,
): SpreadsheetImeCompositionHandlers {
  let composing = false

  const onCompositionstart = () => {
    composing = true
  }
  const onCompositionend = () => {
    composing = false
  }
  const onKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || composing || event.isComposing) return

    if (event.key === 'Enter') {
      event.preventDefault()
      options.onCommit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      options.onCancel()
    }
  }

  return { onCompositionstart, onCompositionend, onKeydown }
}
