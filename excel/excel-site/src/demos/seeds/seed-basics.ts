/**
 * Seed data for the "basics" demo — a small, honest team roster. Verified
 * against `excel/solid-excel/src-vnext/adapter/static-backend.ts`: the
 * static backend's `matrix` seed does NOT parse leading `=` in strings as a
 * formula (every matrix string lands as literal `valueKind: 'string'` text
 * via `valueToDisplayCell`) — formulas only evaluate when set explicitly on
 * a `DisplayCell.formula` field through the sparse `cells` array. So the
 * roster body comes from `matrix` (plain header/name/number cells) and the
 * three totals-row formulas are layered on top via `cells`, landing on rows
 * the matrix left blank.
 */
import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'

const matrix: StaticSeedMatrix = [
  ['Name', 'Role', 'Hours Logged', 'Tasks Done', 'Rating'],
  ['Mina Cho', 'Product Designer', 34, 9, 4.5],
  ['Diego Alvarez', 'Backend Engineer', 38, 11, 4.2],
  ['Priya Nair', 'Frontend Engineer', 36, 10, 4.8],
  ["Sam O'Connor", 'QA Analyst', 30, 14, 4.1],
  ['Layla Haddad', 'Project Manager', 32, 7, 4.6],
  ['Tomas Rivera', 'Data Analyst', 35, 8, 4.3],
  ['Ines Berg', 'UX Researcher', 28, 6, 4.7],
  ['Owen Clarke', 'DevOps Engineer', 33, 9, 4.0],
  ['Farah Idris', 'Backend Engineer', 37, 12, 4.4],
  ['Noah Becker', 'Frontend Engineer', 31, 10, 4.5],
]

// Row 11 (0-indexed) is deliberately left out of the matrix — it renders as
// a blank spacer row above the totals. Row 12 holds the totals: a plain
// label cell plus three formula cells (SUM over the two count columns,
// AVERAGE over the rating column) addressing the data rows at A1 rows 2-11.
const cells: DisplayCell[] = [
  { row: 12, col: 0, displayValue: 'Totals / Averages', valueKind: 'string' },
  { row: 12, col: 2, displayValue: '0', formula: '=SUM(C2:C11)' },
  { row: 12, col: 3, displayValue: '0', formula: '=SUM(D2:D11)' },
  { row: 12, col: 4, displayValue: '0', formula: '=AVERAGE(E2:E11)' },
]

export const basicsSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Team Roster'],
  matrix,
  cells,
}
