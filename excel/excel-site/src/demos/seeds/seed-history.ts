/**
 * Seed data for the "history" demo — a small office-supplies order sheet.
 * Mirrors `seed-basics.ts`'s split: `matrix` supplies the plain header/item/
 * number cells (the static backend does NOT parse a leading `=` in a matrix
 * string as a formula — see that file's note), while the per-row subtotal
 * and grand-total formulas live in `cells`, landing on the `Subtotal` column
 * the matrix rows deliberately leave out.
 *
 * Small on purpose: undo/redo demos read best when every edit is an obvious,
 * single-cell change against a sheet the visitor can hold in their head.
 */
import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'

const matrix: StaticSeedMatrix = [
  ['Item', 'Qty', 'Unit Price', 'Subtotal'],
  ['Notebook', 12, 3.5],
  ['Pen Pack', 20, 1.2],
  ['Stapler', 4, 6.75],
  ['Sticky Notes', 15, 2.1],
  ['Whiteboard', 2, 45],
  ['Desk Lamp', 6, 18.5],
  ['Coffee Beans', 8, 9.25],
]

// Row 8 (0-indexed) is a blank spacer row above the totals, same convention
// as `seed-basics.ts`'s row 11. Rows 1-7 get a per-row Subtotal formula
// (Qty * Unit Price); row 9 holds the grand total.
const cells: DisplayCell[] = [
  { row: 1, col: 3, displayValue: '0', formula: '=B2*C2' },
  { row: 2, col: 3, displayValue: '0', formula: '=B3*C3' },
  { row: 3, col: 3, displayValue: '0', formula: '=B4*C4' },
  { row: 4, col: 3, displayValue: '0', formula: '=B5*C5' },
  { row: 5, col: 3, displayValue: '0', formula: '=B6*C6' },
  { row: 6, col: 3, displayValue: '0', formula: '=B7*C7' },
  { row: 7, col: 3, displayValue: '0', formula: '=B8*C8' },
  { row: 9, col: 0, displayValue: 'Total', valueKind: 'string' },
  { row: 9, col: 3, displayValue: '0', formula: '=SUM(D2:D8)' },
]

export const historySeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Supply Order'],
  matrix,
  cells,
}
