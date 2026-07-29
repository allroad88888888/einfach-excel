/**
 * Seed data for the "data-tools" demo — a deliberately messy import-style
 * sheet exercising all three data-cleanup tools:
 *
 * - Column A holds combined "Last, First" names — Text to Columns fodder.
 * - Rows 3, 6, and 8 (0-indexed) exactly repeat rows 1, 2, and 4 across
 *   every column — Remove Duplicates fodder (3 duplicate rows, 7 unique
 *   rows survive).
 * - Column E is a `=C+D` formula (Total); column F is a blank scratch
 *   target — Paste Special "values only" fodder: copy E2:E11, paste into
 *   F2 with values-only to strip the formulas.
 *
 * Same split as `seed-basics.ts`: the matrix leaves the formula column
 * blank (`null`), then `cells` layers the ten `=C{r}+D{r}` formulas on top
 * — the static backend's `matrix` seed never parses a leading `=` in a
 * string as a formula, only `DisplayCell.formula` does.
 */
import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'

const matrix: StaticSeedMatrix = [
  ['Full Name', 'Department', 'Q1 Sales', 'Q2 Sales', 'Total', 'Paste values here →'],
  ['Diaz, Maria', 'Sales', 420, 380, null],
  ['Chen, Wei', 'Marketing', 310, 295, null],
  ['Diaz, Maria', 'Sales', 420, 380, null],
  ['Okafor, Ada', 'Sales', 275, 300, null],
  ['Nguyen, Linh', 'Support', 190, 210, null],
  ['Chen, Wei', 'Marketing', 310, 295, null],
  ['Rossi, Marco', 'Marketing', 260, 240, null],
  ['Okafor, Ada', 'Sales', 275, 300, null],
  ['Haddad, Yara', 'Support', 330, 315, null],
  ['Petrova, Ana', 'Finance', 400, 420, null],
]

// Rows 2-11 (1-indexed spreadsheet rows) each get `=C{row}+D{row}` layered
// on top of the blank matrix cell — mirrors `seed-basics.ts`'s totals row.
const cells: DisplayCell[] = matrix.slice(1).map((_, dataIndex) => {
  const sheetRow = dataIndex + 2 // 1-indexed spreadsheet row for this data row
  return {
    row: dataIndex + 1, // 0-indexed row in the matrix
    col: 4,
    displayValue: '0',
    formula: `=C${sheetRow}+D${sheetRow}`,
  }
})

export const dataToolsSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Import'],
  matrix,
  cells,
}
