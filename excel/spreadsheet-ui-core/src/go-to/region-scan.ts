import type { RangeSelection } from '../selection'
import type { GoToScanContext, GoToScanResult } from './types'
import { toCellSelection } from './match-packing'

/**
 * Excel's Ctrl+Shift+* — expand outward from the active cell to the first
 * blank row above / below and the first blank column left / right.
 *
 * The expansion stops at the first fully-blank row in each direction; this is
 * the standard "data block detection" behaviour. Implemented as a grid scan
 * because the candidate-cell list isn't sparse in our model.
 */
export function scanCurrentRegion(context: GoToScanContext): GoToScanResult {
  const filled = new Set<string>()
  let minRow = Number.POSITIVE_INFINITY
  let maxRow = Number.NEGATIVE_INFINITY
  let minCol = Number.POSITIVE_INFINITY
  let maxCol = Number.NEGATIVE_INFINITY
  for (const cell of context.cells) {
    const hasValue =
      (cell.valueKind ?? 'blank') !== 'blank' ||
      (cell.displayValue ?? '') !== '' ||
      cell.formula != null
    if (!hasValue) continue
    filled.add(`${cell.row}:${cell.col}`)
    if (cell.row < minRow) minRow = cell.row
    if (cell.row > maxRow) maxRow = cell.row
    if (cell.col < minCol) minCol = cell.col
    if (cell.col > maxCol) maxCol = cell.col
  }
  if (filled.size === 0 || !Number.isFinite(minRow)) {
    // Active cell sits in an empty sheet — surface a single-cell selection
    // at the active cell so callers always observe a well-formed result.
    return {
      regions: [toCellSelection(context.sheetId, context.activeCell.row, context.activeCell.col)],
      truncated: false,
      totalMatchCount: 1,
    }
  }
  const ar = context.activeCell.row
  const ac = context.activeCell.col

  // Expand row-wise — stop at the first fully-blank row.
  let top = ar
  while (top - 1 >= minRow && rowHasFilledCell(filled, top - 1, minCol, maxCol)) {
    top -= 1
  }
  let bottom = ar
  while (bottom + 1 <= maxRow && rowHasFilledCell(filled, bottom + 1, minCol, maxCol)) {
    bottom += 1
  }

  // Expand col-wise — stop at the first fully-blank column.
  let left = ac
  while (left - 1 >= minCol && colHasFilledCell(filled, left - 1, top, bottom)) {
    left -= 1
  }
  let right = ac
  while (right + 1 <= maxCol && colHasFilledCell(filled, right + 1, top, bottom)) {
    right += 1
  }

  if (top === bottom && left === right) {
    return {
      regions: [toCellSelection(context.sheetId, top, left)],
      truncated: false,
      totalMatchCount: 1,
    }
  }

  const region: RangeSelection = {
    kind: 'range',
    sheetId: context.sheetId,
    anchor: { row: top, col: left },
    focus: { row: bottom, col: right },
  }
  return { regions: [region], truncated: false, totalMatchCount: 1 }
}

function rowHasFilledCell(
  filled: ReadonlySet<string>,
  row: number,
  minCol: number,
  maxCol: number,
): boolean {
  for (let c = minCol; c <= maxCol; c += 1) {
    if (filled.has(`${row}:${c}`)) return true
  }
  return false
}

function colHasFilledCell(
  filled: ReadonlySet<string>,
  col: number,
  minRow: number,
  maxRow: number,
): boolean {
  for (let r = minRow; r <= maxRow; r += 1) {
    if (filled.has(`${r}:${col}`)) return true
  }
  return false
}
