import { readFormulaAutocompleteAnchor } from '../formula-autocomplete/formula-autocomplete-anchor'

/** Finds an editor input supported by the formula-autocomplete anchor contract. */
export function getFormulaReferenceFocusTarget(
  activeElement: Element | null,
): HTMLInputElement | null {
  if (!(activeElement instanceof HTMLInputElement)) return null
  return readFormulaAutocompleteAnchor(activeElement) ? activeElement : null
}

/** Returns focus to the editing input at the Atom-owned reference insertion point. */
export function restoreFormulaReferenceFocus(input: HTMLInputElement | null, caret: number): void {
  if (!input) return
  queueMicrotask(() => {
    if (!input.isConnected) return
    input.focus()
    input.setSelectionRange(caret, caret)
  })
}
