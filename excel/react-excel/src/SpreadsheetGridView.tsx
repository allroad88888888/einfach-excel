import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'

/** Inputs for the controlled, read-only spreadsheet grid projection. */
export interface SpreadsheetGridViewProps {
  readonly window: CellRange
  readonly cells: readonly DisplayCell[]
  readonly selected?: CellRange
}

function isSelectedCell(selected: CellRange | undefined, row: number, col: number): boolean {
  return (
    selected !== undefined &&
    row >= selected.rowStart &&
    row <= selected.rowEnd &&
    col >= selected.colStart &&
    col <= selected.colEnd
  )
}

/** Renders a caller-owned spreadsheet projection without fetching or editing it. */
export function SpreadsheetGridView({ window, cells, selected }: SpreadsheetGridViewProps) {
  const cellsByCoordinate = new Map(cells.map((cell) => [`${cell.row}:${cell.col}`, cell]))
  const rows = []

  for (let row = window.rowStart; row <= window.rowEnd; row += 1) {
    const rowCells = []

    for (let col = window.colStart; col <= window.colEnd; col += 1) {
      const cell = cellsByCoordinate.get(`${row}:${col}`)
      const isSelected = isSelectedCell(selected, row, col)

      rowCells.push(
        <td
          key={col}
          className={isSelected ? 'cell cell-selected' : 'cell'}
          data-cell={`${row}:${col}`}
          data-selected={isSelected ? 'true' : undefined}
        >
          {cell?.displayValue ?? ''}
        </td>,
      )
    }

    rows.push(<tr key={row}>{rowCells}</tr>)
  }

  return (
    <table className="spreadsheet-grid">
      <tbody>{rows}</tbody>
    </table>
  )
}
