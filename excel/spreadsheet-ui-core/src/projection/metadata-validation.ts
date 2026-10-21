import type { DisplayCell } from '../backend'
import type { ProjectionResult } from './types'
import { validateCustomFormulaDefinitions } from '../custom-formulas/expression-types'

/** Transport validation only: native code owns thresholds, permissions and content. */
export function validCellMetadata(cell: DisplayCell): boolean {
  if (!cell || typeof cell !== 'object') return false
  if (cell.noteIndicator !== undefined && typeof cell.noteIndicator !== 'boolean') return false
  if (cell.commentIndicator !== undefined && typeof cell.commentIndicator !== 'boolean') return false
  if (cell.commentThreadId !== undefined &&
    (typeof cell.commentThreadId !== 'string' || cell.commentThreadId.length === 0)) return false
  const icon = cell.conditionalIcon
  return icon === undefined || !!icon &&
    ['three-arrows', 'three-traffic-lights', 'three-flags'].includes(icon.set) &&
    [0, 1, 2].includes(icon.index) && typeof icon.showValue === 'boolean'
}

/** Also checks merge anchors and frozen panes before their atoms are published. */
export function validProjectionMetadata(result: ProjectionResult): boolean {
  if (!result.cells.every(validCellMetadata)) return false
  if (result.kind !== 'visible-window') return true
  if (result.customFormulaDefinitions !== undefined) {
    try { validateCustomFormulaDefinitions(result.customFormulaDefinitions) } catch { return false }
  }
  if (result.mergeAnchors?.some((cell) => !validCellMetadata(cell))) return false
  for (const region of result.frozen?.regions ?? []) {
    if (!region.cells.every(validCellMetadata) ||
      region.mergeAnchors?.some((cell) => !validCellMetadata(cell))) return false
  }
  const state = result.protection
  if (state === undefined) return true
  return !!state && ['open', 'protected'].includes(state.mode) &&
    Array.isArray(state.unlockedRanges) && state.unlockedRanges.length <= 256 &&
    state.unlockedRanges.every((range) => range &&
      [range.rowStart, range.rowEnd, range.colStart, range.colEnd].every(Number.isSafeInteger) &&
      range.rowStart >= 0 && range.colStart >= 0 &&
      range.rowStart <= range.rowEnd && range.colStart <= range.colEnd &&
      range.rowEnd < 1_048_576 && range.colEnd < 16_384)
}
