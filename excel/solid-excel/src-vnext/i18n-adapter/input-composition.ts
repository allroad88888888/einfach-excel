/**
 * Tracks an individual input element's DOM composition session.
 *
 * This deliberately owns no product state: the browser is the authority for
 * an IME session and the guard only prevents command-key handlers from taking
 * Enter, Escape, or legacy Process events before that session is finalized.
 */
export interface InputCompositionGuard {
  onCompositionStart(): void
  onCompositionEnd(): void
  isComposing(event: KeyboardEvent): boolean
  reset(): boolean
}

function isLegacyCompositionKey(event: KeyboardEvent): boolean {
  return event.key === 'Process' || event.keyCode === 229
}

export function createInputCompositionGuard(): InputCompositionGuard {
  let composing = false

  return {
    onCompositionStart() {
      composing = true
    },
    onCompositionEnd() {
      composing = false
    },
    isComposing(event) {
      return composing || event.isComposing || isLegacyCompositionKey(event)
    },
    reset() {
      const wasComposing = composing
      composing = false
      return wasComposing
    },
  }
}
