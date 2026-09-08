import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'
import type { CSSProperties } from 'react'
import { cellFormatStyle, cellTextRotationStyle } from './cell-format-style'
import {
  WORKBOOK_GRID_ROW_HEIGHT,
  WORKBOOK_GRID_COLUMN_WIDTH,
} from '../viewport/workbook-grid-config'

/** Inputs for the controlled, read-only spreadsheet grid projection. */
export interface SpreadsheetGridProps {
  readonly window: CellRange
  readonly cells: readonly DisplayCell[]
  readonly selected?: CellRange
  readonly rowHeights?: readonly number[]
  readonly columnWidths?: readonly number[]
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
export function SpreadsheetGrid({
  window,
  cells,
  selected,
  rowHeights,
  columnWidths,
}: SpreadsheetGridProps) {
  const cellsByCoordinate = new Map(cells.map((cell) => [`${cell.row}:${cell.col}`, cell]))
  const rows = []
  const outline = visibleSelection(window, selected)

  for (let row = window.rowStart; row <= window.rowEnd; row += 1) {
    if (rowHeights?.[row - window.rowStart] === 0) continue
    const rowCells = []

    for (let col = window.colStart; col <= window.colEnd; col += 1) {
      if (columnWidths?.[col - window.colStart] === 0) continue
      const cell = cellsByCoordinate.get(`${row}:${col}`)
      const isSelected = isSelectedCell(selected, row, col)
      const rotationStyle = cellTextRotationStyle(cell?.format)
      const formatStyle = cellFormatStyle(cell?.format) ?? {}
      const height = rowHeights?.[row - window.rowStart] ?? WORKBOOK_GRID_ROW_HEIGHT
      // table 的内容上限扣除真实边框；16px 行高也不能被大字或粗边框反向撑开。
      const topBorder = Number.parseFloat(
        String(formatStyle.borderTopWidth ?? (formatStyle.borderTopStyle ? 3 : 0)),
      )
      const bottomBorder = Number.parseFloat(String(formatStyle.borderBottomWidth ?? 1))
      const displayValue = cell?.displayValue ?? ''

      rowCells.push(
        <td
          key={col}
          className={isSelected ? 'cell cell-selected' : 'cell'}
          data-cell={`${row}:${col}`}
          data-selected={isSelected ? 'true' : undefined}
          style={formatStyle}
        >
          <span
            className="cell-content"
            style={{ maxHeight: Math.max(0, height - 6 - topBorder - bottomBorder) }}
          >
            {rotationStyle ? (
              <span className="cell-rotated-text" style={rotationStyle}>
                {displayValue}
              </span>
            ) : (
              displayValue
            )}
          </span>
        </td>,
      )
    }

    rows.push(
      <tr
        key={row}
        style={
          {
            height: rowHeights?.[row - window.rowStart],
          } as CSSProperties
        }
      >
        {rowCells}
      </tr>,
    )
  }

  const outlineStyle = outline
    ? ({
        '--selection-left': `${sumSizes(columnWidths, 0, outline.colStart - window.colStart, WORKBOOK_GRID_COLUMN_WIDTH)}px`,
        '--selection-width': `${sumSizes(
          columnWidths,
          outline.colStart - window.colStart,
          outline.colEnd - window.colStart + 1,
          WORKBOOK_GRID_COLUMN_WIDTH,
        )}px`,
        '--selection-top': `${sumSizes(
          rowHeights,
          0,
          outline.rowStart - window.rowStart,
          WORKBOOK_GRID_ROW_HEIGHT,
        )}px`,
        '--selection-height': `${sumSizes(
          rowHeights,
          outline.rowStart - window.rowStart,
          outline.rowEnd - window.rowStart + 1,
          WORKBOOK_GRID_ROW_HEIGHT,
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
        {columnWidths && (
          <colgroup>
            {columnWidths
              .filter((width) => width > 0)
              .map((width, index) => (
                <col key={index} style={{ width }} />
              ))}
          </colgroup>
        )}
        <tbody>{rows}</tbody>
      </table>
      {outline && <div aria-hidden="true" className={outlineClassName} style={outlineStyle} />}
    </>
  )
}

function sumSizes(
  sizes: readonly number[] | undefined,
  start: number,
  end: number,
  fallback: number,
): number {
  let total = 0
  for (let index = start; index < end; index += 1) {
    total += sizes?.[index] ?? fallback
  }
  return total
}
