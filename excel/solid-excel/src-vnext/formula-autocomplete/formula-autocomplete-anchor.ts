export interface FormulaAutocompleteAnchor {
  left: number
  top: number
  width: number
  bottom: number
}

/** Reads the viewport anchor for a supported formula editing input. */
export function readFormulaAutocompleteAnchor(
  target: EventTarget | null,
): FormulaAutocompleteAnchor | null {
  if (!(target instanceof HTMLElement)) return null
  if (!target.classList.contains('cell-input') && !target.classList.contains('formula-bar-input')) {
    return null
  }

  const rect = target.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    bottom: rect.bottom,
  }
}
