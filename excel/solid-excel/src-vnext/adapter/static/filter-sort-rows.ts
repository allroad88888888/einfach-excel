// 一句话：按筛选规则求出一张 sheet 的可见行序列。

import type { DisplayCell, FilterSortState } from '@einfach/spreadsheet-ui-core'
import { keyFor } from '@einfach/spreadsheet-ui-core'
import { buildFilterSortDisplayRows as buildFilterSortDisplayRowsShared } from '../filter-predicate'
import type { EvalCellLookup } from '../static-formula-eval'
import { evaluateFormula, formatEvalResult } from '../static-formula-eval'

function readFilterSortValue(
  sheetCells: Map<string, DisplayCell>,
  lookup: EvalCellLookup,
  row: number,
  col: number,
): string {
  const cell = sheetCells.get(keyFor(row, col))
  if (!cell) return ''
  if (!cell.formula) return cell.displayValue

  const evaluated = evaluateFormula(cell.formula, lookup, new Set(), { row, col })
  return formatEvalResult(evaluated).display
}

export function getMaxSourceRow(sheetCells: Map<string, DisplayCell>): number {
  let maxRow = -1
  for (const cell of sheetCells.values()) {
    if (cell.row > maxRow) maxRow = cell.row
  }
  return maxRow
}

export function buildFilterSortDisplayRows(
  sheetCells: Map<string, DisplayCell>,
  lookup: EvalCellLookup,
  state: FilterSortState | undefined,
): number[] | null {
  const maxRow = getMaxSourceRow(sheetCells)
  // Filter VISIBILITY only. Physical sort (`sortRange`, #29) is the sole sort
  // authority for the static backend; the display-permutation sort branch was
  // retired entirely with #24, so this permutation can never reorder rows.
  return buildFilterSortDisplayRowsShared(
    state,
    { headerRow: 0, startRow: 1, endRow: maxRow + 1 },
    (row, col) => readFilterSortValue(sheetCells, lookup, row, col),
  )
}
