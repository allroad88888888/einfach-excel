import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'
import { cellFormatStyle } from './cell-format-style'
import { WORKBOOK_GRID_ROW_HEIGHT } from '../viewport/workbook-grid-config'

/** Inputs for the controlled, read-only spreadsheet grid projection. */
export interface SpreadsheetGridProps {
  readonly window: CellRange
  readonly cells: readonly DisplayCell[]
  readonly selected?: CellRange
  readonly rowHeights?: readonly number[]
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

function visibleSelection(window: CellRange, selected: CellRange | undefined): CellRange | null {
  if (!selected) return null
  const intersection = {
    rowStart: Math.max(window.rowStart, selected.rowStart),
    rowEnd: Math.min(window.rowEnd, selected.rowEnd),
    colStart: Math.max(window.colStart, selected.colStart),
    colEnd: Math.min(window.colEnd, selected.colEnd),
  }
  return intersection.rowStart <= intersection.rowEnd &&
    intersection.colStart <= intersection.colEnd
    ? intersection
    : null
}

/** Renders a caller-owned spreadsheet projection without fetching or editing it. */
export function SpreadsheetGrid({ window, cells, selected, rowHeights }: SpreadsheetGridProps) {
  const cellsByCoordinate = new Map(cells.map((cell) => [`${cell.row}:${cell.col}`, cell]))
  const rows = []
  const outline = visibleSelection(window, selected)

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
          style={cellFormatStyle(cell?.format)}
        >
          {cell?.displayValue ?? ''}
        </td>,
      )
    }

    rows.push(
      <tr key={row} style={{ height: rowHeights?.[row - window.rowStart] }}>
        {rowCells}
      </tr>,
    )
  }

  const outlineStyle = outline
    ? ({
        '--selection-col-offset': outline.colStart - window.colStart,
        '--selection-col-span': outline.colEnd - outline.colStart + 1,
        '--selection-top': `${sumRowHeights(
          rowHeights,
          0,
          outline.rowStart - window.rowStart,
        )}px`,
        '--selection-height': `${sumRowHeights(
          rowHeights,
          outline.rowStart - window.rowStart,
          outline.rowEnd - window.rowStart + 1,
        )}px`,
      } as CSSProperties)
    : undefined
  const outlineClassName = [
    'selection-outline',
    outline?.rowStart === selected?.rowStart && 'selection-outline-top',
    outline?.colEnd === selected?.colEnd && 'selection-outline-right',
    outline?.rowEnd === selected?.rowEnd && 'selection-outline-bottom',
    outline?.colStart === selected?.colStart && 'selection-outline-left',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <table className="spreadsheet-grid">
        <tbody>{rows}</tbody>
      </table>
      {outline && <div aria-hidden="true" className={outlineClassName} style={outlineStyle} />}
    </>
  )
}

function sumRowHeights(
  rowHeights: readonly number[] | undefined,
  start: number,
  end: number,
): number {
  let total = 0
  for (let index = start; index < end; index += 1) {
    total += rowHeights?.[index] ?? WORKBOOK_GRID_ROW_HEIGHT
  }
  return total
}
