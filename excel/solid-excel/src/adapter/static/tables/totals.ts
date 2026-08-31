// 一句话：Table 汇总行单元格的写入。

import type { CellRange, TableTotalsFunction } from '@einfach/spreadsheet-ui-core'
import { keyFor } from '@einfach/spreadsheet-ui-core'
import { updateCell } from '../cell-update'
import { recordCellBefore } from '../history-record'
import type { StaticBackendState, StaticTableEntry } from '../state'
import { getOrCreateSheetCells } from '../state'

// --- Totals row (design-excel-table.md §7, parity #32 T6) -------------------
//
// The totals row is a Table-INTERNAL behaviour, not a sheet structural op:
// toggling it grows/shrinks the Table's own range by one row and writes/clears
// `=SUBTOTAL(1xx, Table[Col])` formulas through the ordinary cell path, so the
// cell formula IS the fact — there is no second per-column source of truth and
// a UI reconstructs its dropdown by reading the cell formula back.

/**
 * Totals aggregate id → SUBTOTAL function number, mirroring the engine
 * `TotalsFunction::subtotal_code`. Every code sits in the **101-111** band so
 * a totals aggregate excludes host-hidden rows. `null` means "clear the cell".
 */
export const TOTALS_SUBTOTAL_CODES: Readonly<Record<TableTotalsFunction, number | null>> = {
  none: null,
  average: 101,
  countNums: 102,
  count: 103,
  max: 104,
  min: 105,
  stdDev: 107,
  sum: 109,
  var: 110,
}

/** Excel's default aggregate for a freshly enabled totals row: SUM. */
export const TOTALS_DEFAULT_SUBTOTAL_CODE = 109

/**
 * Canonical totals-cell formula text. Matches the engine's `render_formula`
 * output byte-for-byte (no space after the comma, bare single-column spec) so
 * the two backends store the SAME formula string and the rename walkers in
 * `rewriteStructuredRefsInFormula` match it identically.
 */
function totalsSubtotalFormula(table: string, column: string, code: number): string {
  return `=SUBTOTAL(${code},${table}[${column}])`
}

/**
 * Does any cell in `range` hold a formula or a non-empty primitive? The
 * totals-row occupancy guard — the engine never pushes existing content down
 * to make room (`range_has_content` / `TableError::TotalsRowBlocked`).
 */
export function rangeHasContent(
  state: StaticBackendState,
  sheetId: string,
  range: CellRange,
): boolean {
  const cells = state.cellsBySheet.get(sheetId)
  if (!cells) return false
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const cell = cells.get(keyFor(row, col))
      if (!cell) continue
      if (cell.formula !== undefined || cell.displayValue !== '') return true
    }
  }
  return false
}

/** Write (or clear, when `code` is `null`) one totals-row cell. */
export function writeTotalsCell(
  state: StaticBackendState,
  entry: StaticTableEntry,
  columnIndex: number,
  code: number | null,
): void {
  const cells = getOrCreateSheetCells(state, entry.sheetId)
  const row = entry.range.rowEnd
  const col = entry.range.colStart + columnIndex
  recordCellBefore(state, entry.sheetId, keyFor(row, col))
  if (code === null) {
    cells.delete(keyFor(row, col))
    return
  }
  updateCell(cells, {
    kind: 'set-cell-input',
    sheetId: entry.sheetId,
    row,
    col,
    input: totalsSubtotalFormula(entry.canonicalName, entry.columns[columnIndex], code),
  })
}
