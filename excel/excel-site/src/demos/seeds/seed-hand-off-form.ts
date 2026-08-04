import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'

const matrix: StaticSeedMatrix = [
  ['Expense request', 'August product launch', null, null],
  ['Owner', 'Mina Cho', null, null],
  ['Cost centre', 'Product', null, null],
  [],
  ['Line item', 'Requested amount', 'Approved amount', 'Variance'],
  ['Research incentive', 1800, 1500, null],
  ['Prototype materials', 2400, 2400, null],
  ['Accessibility review', 1200, 900, null],
  ['Contingency', 600, 0, null],
  [],
  ['Total', null, null, null],
]

const cells: DisplayCell[] = [
  { row: 5, col: 3, displayValue: '0', formula: '=C6-B6' },
  { row: 6, col: 3, displayValue: '0', formula: '=C7-B7' },
  { row: 7, col: 3, displayValue: '0', formula: '=C8-B8' },
  { row: 8, col: 3, displayValue: '0', formula: '=C9-B9' },
  { row: 10, col: 1, displayValue: '0', formula: '=SUM(B6:B9)' },
  { row: 10, col: 2, displayValue: '0', formula: '=SUM(C6:C9)' },
  { row: 10, col: 3, displayValue: '0', formula: '=C11-B11' },
]

/** A concrete approval form whose calculations survive hand-off to another editor. */
export const handOffFormSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Request'],
  matrix,
  cells,
}
