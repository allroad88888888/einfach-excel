import type { VisibleProjectionResult } from '../backend'
import type { CellCoord } from '../shared'

/** Resolves the active cell's editable source from the current projection. */
export function getSourceTextFromProjection(
  result: VisibleProjectionResult | undefined,
  cell: CellCoord,
  activeSheetId: string,
): string | undefined {
  if (!result || result.sheetId !== activeSheetId) return undefined
  if (
    cell.row < result.window.rowStart ||
    cell.row > result.window.rowEnd ||
    cell.col < result.window.colStart ||
    cell.col > result.window.colEnd
  ) {
    return undefined
  }

  const projectionCell = result.cells.find(
    (candidate) => candidate.row === cell.row && candidate.col === cell.col,
  )
  return projectionCell
    ? (projectionCell.inputText ?? projectionCell.formula ?? projectionCell.displayValue ?? '')
    : ''
}
