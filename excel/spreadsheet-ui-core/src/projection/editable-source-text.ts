import type { VisibleProjectionResult } from '../backend'
import type { CellCoord } from '../shared'
import { cellAtProjection } from './cell-at'

/** Resolves the active cell's editable source from the current projection. */
export function getSourceTextFromProjection(
  result: VisibleProjectionResult | undefined,
  cell: CellCoord,
  activeSheetId: string,
): string | undefined {
  if (!result || result.sheetId !== activeSheetId) return undefined
  const projectionCell = cellAtProjection(result, cell)
  if (projectionCell === undefined) return undefined
  return projectionCell
    ? (projectionCell.inputText ?? projectionCell.formula ?? projectionCell.displayValue ?? '')
    : ''
}
