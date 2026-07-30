/**
 * Seed data for the "filter-sort" demo — a small orders table with a
 * category column (3 distinct values, good for the Filter dropdown) and a
 * numeric Quantity column (15 distinct values, good for Sort asc/desc).
 *
 * Engine facts verified by reading `static-backend.ts` /
 * `static-formula-eval.ts` before writing the totals row (do not change the
 * formula kind without re-checking):
 *
 * - Plain `SUM`/`AVERAGE` fall through to `aggregateNumeric`, which reads
 *   `this.resolve` directly and is never given `hiddenRows`/`filterHiddenRows`
 *   — a filter-hidden row still counts toward a plain SUM.
 * - Only `SUBTOTAL(fn, range)` is visibility-aware: `applySubtotal` skips
 *   filter-hidden rows for BOTH the 1-11 and 101-111 bands, and additionally
 *   skips manually-hidden rows for 101-111. So the totals row below uses
 *   `SUBTOTAL(109, …)` (SUM) and `SUBTOTAL(101, …)` (AVERAGE) — the only
 *   formulas that make "hide a category → the totals update" observable.
 * - The filter/sort predicate (`filter-predicate.ts`) auto-detects a
 *   "summary row": the LAST row holding any cell, if its column-A label is
 *   exactly `total` or `summary` (case-insensitive), is pinned always-visible
 *   and excluded from the filter dropdown's available-values scan
 *   (`SpreadsheetFilterDropdown.tsx`'s `isSummaryLabel`). Row 17's label is
 *   `'Total'` — singular, exact — to opt into both.
 * - `resolveSortRange` (Sort toolbar/dropdown) walks Ctrl+Down/Ctrl+Right
 *   from A1 via `resolveDataEdge`, which stops at the first blank cell. Row
 *   16 is left out of `matrix` entirely (no cells there) so the data edge —
 *   and therefore the Sort range — stops at row 15, never reaching the
 *   totals row.
 */
import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'

const matrix: StaticSeedMatrix = [
  ['Order ID', 'Category', 'Quantity', 'Unit Price', 'Total'],
  ['ORD-1001', 'Electronics', 12, 45.0, 540.0],
  ['ORD-1002', 'Office Supplies', 30, 3.5, 105.0],
  ['ORD-1003', 'Furniture', 4, 220.0, 880.0],
  ['ORD-1004', 'Electronics', 8, 89.99, 719.92],
  ['ORD-1005', 'Office Supplies', 50, 1.2, 60.0],
  ['ORD-1006', 'Furniture', 2, 350.0, 700.0],
  ['ORD-1007', 'Electronics', 15, 25.5, 382.5],
  ['ORD-1008', 'Office Supplies', 20, 4.75, 95.0],
  ['ORD-1009', 'Furniture', 6, 150.0, 900.0],
  ['ORD-1010', 'Electronics', 10, 60.0, 600.0],
  ['ORD-1011', 'Office Supplies', 40, 2.0, 80.0],
  ['ORD-1012', 'Furniture', 3, 275.0, 825.0],
  ['ORD-1013', 'Electronics', 18, 33.25, 598.5],
  ['ORD-1014', 'Office Supplies', 25, 3.0, 75.0],
  ['ORD-1015', 'Furniture', 5, 199.99, 999.95],
]

// Row 16 (0-indexed) is deliberately absent from `matrix` — a blank spacer
// that both stops `resolveDataEdge`'s Ctrl+Down scan at row 15 (keeping the
// totals row out of the Sort range) and keeps the totals row from being
// treated as a 16th data row by the filter predicate.
const cells: DisplayCell[] = [
  { row: 17, col: 0, displayValue: 'Total', valueKind: 'string' },
  { row: 17, col: 2, displayValue: '0', formula: '=SUBTOTAL(109,C2:C16)' },
  { row: 17, col: 3, displayValue: '0', formula: '=SUBTOTAL(101,D2:D16)' },
  { row: 17, col: 4, displayValue: '0', formula: '=SUBTOTAL(109,E2:E16)' },
]

export const filterSortSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Orders'],
  matrix,
  cells,
}
