// 一句话：按行置换物理搬运单元格与其逐格格式。

import type { CellRange, DisplayCell, SpreadsheetCellFormat } from '@einfach/spreadsheet-ui-core'
import { keyFor } from '@einfach/spreadsheet-ui-core'

/**
 * Physically relocate cells and per-cell formats under the row permutation
 * (`rowMap`: source row → slot row, changed rows only), restricted to the
 * range's columns. The map is a bijection on the changed rows, so snapshotting
 * every source position, clearing them, then writing them at their slot rows
 * cannot collide. Returns the count of non-empty cells that moved.
 */
export function relocateSortedCells(
  cells: Map<string, DisplayCell>,
  cellFormats: Map<string, SpreadsheetCellFormat>,
  range: CellRange,
  rowMap: ReadonlyMap<number, number>,
): number {
  const movingCells: Array<{ cell: DisplayCell; col: number; slot: number }> = []
  const movingFormats: Array<{ format: SpreadsheetCellFormat; col: number; slot: number }> = []

  for (const [sourceRow, slotRow] of rowMap) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const key = keyFor(sourceRow, col)
      const cell = cells.get(key)
      if (cell) movingCells.push({ cell, col, slot: slotRow })
      const format = cellFormats.get(key)
      if (format) movingFormats.push({ format, col, slot: slotRow })
    }
  }

  // Clear all source positions before writing slots (bijection → no residue).
  for (const [sourceRow] of rowMap) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const key = keyFor(sourceRow, col)
      cells.delete(key)
      cellFormats.delete(key)
    }
  }

  for (const { cell, col, slot } of movingCells) {
    cells.set(keyFor(slot, col), { ...cell, row: slot })
  }
  for (const { format, col, slot } of movingFormats) {
    cellFormats.set(keyFor(slot, col), format)
  }
  return movingCells.length
}
