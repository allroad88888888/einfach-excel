import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'

const matrix: StaticSeedMatrix = [
  ['Full Name', 'Department', 'Q1 Sales', 'Q2 Sales', 'Total', 'Values-only target'],
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

const cells: DisplayCell[] = matrix.slice(1).map((_, dataIndex) => {
  const row = dataIndex + 2
  return {
    row: dataIndex + 1,
    col: 4,
    displayValue: '0',
    formula: `=C${row}+D${row}`,
  }
})

/** Deliberately duplicated import rows for split, deduplicate, and undo exercises. */
export const cleanMessyDataSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Import'],
  matrix,
  cells,
}
