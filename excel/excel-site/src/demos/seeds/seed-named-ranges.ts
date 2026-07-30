/**
 * Seed data for the "named-ranges" demo — a small budget sheet plus the
 * A1 ranges that get pre-registered as named ranges once the static backend
 * exists (see `NamedRangesDemo.tsx`, which calls `backend.setNamedRange` for
 * every `namedRangesPreset` entry before the chrome ever mounts). The static
 * backend's seed input itself has no `namedRanges` field — pre-registration
 * always goes through the mutation API, not the seed.
 *
 * Layout (0-indexed row/col; A1 in parens):
 *   row0 (A1 row1): header — Category | Jan | Feb | Mar
 *   row1 (row2):    Revenue          — the `Revenue` named range (B2:D2)
 *   row2-4 (3-5):   Cost of Goods / Marketing / Salaries — the `Expenses`
 *                   named range (B3:D5)
 *   row5:           blank spacer, left out of the matrix on purpose
 *   row6 (row7):    Total Expenses formulas — the `TotalRow` named range
 *                   (B7:D7)
 *   row7 (row8):    Net Income formulas (Revenue minus Total Expenses)
 */
import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'

/** Explicit id so the pre-registration calls below don't guess the default. */
export const NAMED_RANGES_SHEET_ID = 'budget'

const matrix: StaticSeedMatrix = [
  ['Category', 'Jan', 'Feb', 'Mar'],
  ['Revenue', 42000, 45000, 47500],
  ['Cost of Goods', 15000, 15800, 16200],
  ['Marketing', 4000, 4200, 4600],
  ['Salaries', 18000, 18000, 18500],
]

// Row 5 (0-indexed) is a deliberate blank spacer, same trick `seed-basics.ts`
// uses — the matrix stops at row 4 and the formula rows below start at row 6.
const cells: DisplayCell[] = [
  { row: 6, col: 0, displayValue: 'Total Expenses', valueKind: 'string' },
  { row: 6, col: 1, displayValue: '0', formula: '=SUM(B3:B5)' },
  { row: 6, col: 2, displayValue: '0', formula: '=SUM(C3:C5)' },
  { row: 6, col: 3, displayValue: '0', formula: '=SUM(D3:D5)' },
  { row: 7, col: 0, displayValue: 'Net Income', valueKind: 'string' },
  { row: 7, col: 1, displayValue: '0', formula: '=B2-B7' },
  { row: 7, col: 2, displayValue: '0', formula: '=C2-C7' },
  { row: 7, col: 3, displayValue: '0', formula: '=D2-D7' },
]

export const namedRangesSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: [{ id: NAMED_RANGES_SHEET_ID, name: 'Budget' }],
  matrix,
  cells,
}

export interface NamedRangePreset {
  name: string
  /** A1 range address, no sheet prefix — the sheet comes from `refersTo.sheetId`. */
  address: string
}

/**
 * Pre-registered on load via `backend.setNamedRange` (workbook scope).
 * `TotalRow` intentionally targets the "Total Expenses" row (B7:D7), not the
 * Net Income row below it — its label is the literal match for the name.
 */
export const namedRangesPreset: readonly NamedRangePreset[] = [
  { name: 'Revenue', address: 'B2:D2' },
  { name: 'Expenses', address: 'B3:D5' },
  { name: 'TotalRow', address: 'B7:D7' },
]
