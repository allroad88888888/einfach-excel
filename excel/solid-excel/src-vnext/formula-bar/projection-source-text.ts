import type { CellCoord, VisibleProjectionResult } from '@einfach/spreadsheet-ui-core'

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

  const draftCell = result.cells.find(
    (projectionCell) => projectionCell.row === cell.row && projectionCell.col === cell.col,
  )
  return draftCell ? (draftCell.formula ?? draftCell.displayValue ?? '') : ''
}
