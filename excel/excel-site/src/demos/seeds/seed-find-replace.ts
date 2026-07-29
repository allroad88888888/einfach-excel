/**
 * Seed for the "find-replace" demo — a small product catalog engineered so
 * every capability the find/replace dialog exposes has something real to
 * find:
 *
 * - "Widget" appears in the Product column with mixed capitalization
 *   (`widget mini`, `WIDGET PRO`, `WIDGET Deluxe` vs. the plain-case rows)
 *   so toggling "Case sensitive" visibly changes the match count
 *   (10 case-insensitive vs. 7 case-sensitive).
 * - Every Status cell contains the substring "Stock" (`In Stock` /
 *   `Out of Stock` / `Low Stock`), but none of them equal it exactly — so
 *   "Match entire cell" flips a 15-match search into a 0-match one, and the
 *   contrast is legible without the reader auditing every row.
 * - Two totals-row formula cells (`=SUM(...)`) give the "Search formulas"
 *   scope a real hit: searching "SUM" only surfaces them when that option
 *   is on, since plain search reads `displayValue`, not `formula`.
 *
 * Same shape as `seed-basics.ts`: the static backend's `matrix` seed never
 * parses a leading `=` as a formula (see that file's header comment), so
 * the catalog body is plain `matrix` cells and the totals-row formulas are
 * layered on top via the sparse `cells` array on a row the matrix leaves
 * blank.
 */
import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'

const matrix: StaticSeedMatrix = [
  ['Product', 'SKU', 'Category', 'Price', 'Qty In Stock', 'Status'],
  ['Widget Classic', 'SKU-1001', 'Hardware', 12.5, 40, 'In Stock'],
  ['widget mini', 'SKU-1002', 'Hardware', 8.0, 0, 'Out of Stock'],
  ['WIDGET PRO', 'SKU-1003', 'Hardware', 24.0, 15, 'In Stock'],
  ['Gadget Basic', 'SKU-2001', 'Electronics', 19.99, 22, 'In Stock'],
  ['Gadget Pro', 'SKU-2002', 'Electronics', 39.99, 5, 'Low Stock'],
  ['Widget Pro Max', 'SKU-1004', 'Hardware', 29.99, 0, 'Out of Stock'],
  ['Widget Accessory Kit', 'SKU-1005', 'Accessories', 6.5, 60, 'In Stock'],
  ['Gizmo Standard', 'SKU-3001', 'Electronics', 14.75, 30, 'In Stock'],
  ['Gizmo Pro', 'SKU-3002', 'Electronics', 34.75, 12, 'In Stock'],
  ['Widget Mini Pro', 'SKU-1006', 'Hardware', 15.25, 18, 'In Stock'],
  ['Bracket Widget', 'SKU-4001', 'Accessories', 3.25, 100, 'In Stock'],
  ['WIDGET Deluxe', 'SKU-1007', 'Hardware', 22.0, 0, 'Out of Stock'],
  ['Gadget Mini', 'SKU-2003', 'Electronics', 11.5, 45, 'In Stock'],
  ['Connector Widget Set', 'SKU-4002', 'Accessories', 9.0, 25, 'In Stock'],
  ['Widget Travel Case', 'SKU-5001', 'Accessories', 17.0, 8, 'Low Stock'],
]

// Row 16 (0-indexed) is deliberately left out of the matrix as a blank
// spacer row above the totals, mirroring `seed-basics.ts`. Row 17 holds the
// totals: a label plus two SUM formulas over the two numeric columns
// (Price, Qty In Stock) addressing the 15 data rows at 0-indexed rows 1-15.
const cells: DisplayCell[] = [
  { row: 17, col: 0, displayValue: 'Totals', valueKind: 'string' },
  { row: 17, col: 3, displayValue: '0', formula: '=SUM(D2:D16)' },
  { row: 17, col: 4, displayValue: '0', formula: '=SUM(E2:E16)' },
]

export const findReplaceSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Catalog'],
  matrix,
  cells,
}
