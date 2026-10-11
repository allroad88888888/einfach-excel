import type { CellRange, DisplayCell } from '@einfach/spreadsheet-ui-core'
import { mergeRangeAt, nativeFilterRangeAtom, nativeTableFiltersAtom, formulaReferenceSessionAtom,
  projectionSnapshotAtom, viewportMetricsAtom } from '@einfach/spreadsheet-ui-core'
import { useAtomValue } from '@einfach/react'
import { CellFilterButton } from './CellFilterButton'
import { CellDataBar } from './CellDataBar'
import type { CSSProperties } from 'react'
import { cellFormatStyle, cellTextRotationStyle } from './cell-format-style'
import { createGridBorderStyles } from './grid-border-style'
import {
  WORKBOOK_GRID_ROW_HEIGHT,
  WORKBOOK_GRID_COLUMN_WIDTH,
} from '../viewport/workbook-grid-config'

/** Inputs for the controlled, read-only spreadsheet grid projection. */
export interface SpreadsheetGridProps {
  readonly window: CellRange
  readonly cells: readonly DisplayCell[]
  readonly mergedRanges?: readonly CellRange[]
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
  mergedRanges,
  selected: selectionRange,
  rowHeights,
  columnWidths,
}: SpreadsheetGridProps) {
  const filterRange = useAtomValue(nativeFilterRangeAtom)
  const tableFilters = useAtomValue(nativeTableFiltersAtom)
  const reference = useAtomValue(formulaReferenceSessionAtom)
  const projection = useAtomValue(projectionSnapshotAtom).result
  const metrics = useAtomValue(viewportMetricsAtom)
  const picked = reference?.pickAnchor && reference.pickFocus ? {
    rowStart: Math.min(reference.pickAnchor.row, reference.pickFocus.row),
    rowEnd: Math.max(reference.pickAnchor.row, reference.pickFocus.row),
    colStart: Math.min(reference.pickAnchor.col, reference.pickFocus.col),
    colEnd: Math.max(reference.pickAnchor.col, reference.pickFocus.col),
  } : undefined
  const selected = picked ?? selectionRange
  const cellsByCoordinate = new Map(cells.map((cell) => [`${cell.row}:${cell.col}`, cell]))
  const borderStyle = createGridBorderStyles({ cells, window, rowHeights, columnWidths,
    projection: projection?.kind === 'visible-window' ? projection : undefined,
    scrollTop: metrics.scrollTop, scrollLeft: metrics.scrollLeft,
  })
  const rows = []
  const outline = visibleSelection(window, selected)

  for (let row = window.rowStart; row <= window.rowEnd; row += 1) {
    if (rowHeights?.[row - window.rowStart] === 0) continue
    const rowCells = []
    const tableHeaders = tableFilters.filter((target) => target.range.rowStart === row)

    for (let col = window.colStart; col <= window.colEnd; col += 1) {
      if (columnWidths?.[col - window.colStart] === 0) continue
      const cell = cellsByCoordinate.get(`${row}:${col}`)
      const merged = mergeRangeAt(mergedRanges ?? [], { row, col }) !== undefined
      const isSelected = isSelectedCell(selected, row, col)
      const rotationStyle = cellTextRotationStyle(cell?.format)
      const formatStyle = {
        ...cellFormatStyle(
          cell?.format ? { ...cell.format, borders: undefined } : undefined, cell?.valueKind,
        ),
        ...borderStyle(row, col, cell?.format),
      }
      const height = rowHeights?.[row - window.rowStart] ?? WORKBOOK_GRID_ROW_HEIGHT
      // table 的内容上限扣除真实边框；16px 行高也不能被大字或粗边框反向撑开。
      const topBorder = Number.parseFloat(
        String(formatStyle.borderTopWidth ?? (formatStyle.borderTopStyle ? 3 : 0)),
      )
      const bottomBorder = Number.parseFloat(String(formatStyle.borderBottomWidth ?? 1))
      const displayValue = cell?.displayValue ?? ''
      const filterTable = tableHeaders.find(({ range }) =>
        col >= range.colStart && col <= range.colEnd)?.table
      const filterHeader = !merged && (filterTable !== undefined || row === filterRange?.rowStart
        && col >= filterRange.colStart && col <= filterRange.colEnd)

      rowCells.push(
        <td
          key={col}
          className={`cell${isSelected ? ' cell-selected' : ''}${filterHeader ? ' cell-filter-header' : ''}${cell?.dataBar && !merged ? ' cell-data-bar-host' : ''}`}
          data-cell={`${row}:${col}`}
          aria-hidden={merged || undefined}
          data-selected={isSelected ? 'true' : undefined}
          style={formatStyle}
        >
          {!merged && <CellDataBar bar={cell?.dataBar} />}
          <span
            className="cell-content"
            style={{
              maxHeight: Math.max(0, height - 6 - topBorder - bottomBorder),
              visibility: merged ? 'hidden' : undefined,
            }}
          >
            {rotationStyle ? (
              <span className="cell-rotated-text" style={rotationStyle}>
                {displayValue}
              </span>
            ) : (
              displayValue
            )}
          </span>
          {filterHeader && <CellFilterButton col={col} table={filterTable} />}
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

  const outlineWidth = outline
    ? sumSizes(
        columnWidths,
        outline.colStart - window.colStart,
        outline.colEnd - window.colStart + 1,
        WORKBOOK_GRID_COLUMN_WIDTH,
      )
    : 0
  const outlineHeight = outline
    ? sumSizes(
        rowHeights,
        outline.rowStart - window.rowStart,
        outline.rowEnd - window.rowStart + 1,
        WORKBOOK_GRID_ROW_HEIGHT,
      )
    : 0
  const outlineStyle =
    outline && outlineWidth > 0 && outlineHeight > 0
      ? ({
          '--selection-left': `${sumSizes(columnWidths, 0, outline.colStart - window.colStart, WORKBOOK_GRID_COLUMN_WIDTH)}px`,
          '--selection-width': `${outlineWidth}px`,
          '--selection-top': `${sumSizes(
            rowHeights,
            0,
            outline.rowStart - window.rowStart,
            WORKBOOK_GRID_ROW_HEIGHT,
          )}px`,
          '--selection-height': `${outlineHeight}px`,
        } as CSSProperties)
      : undefined
  const outlineClassName = [
    'selection-outline',
    picked && 'formula-reference-outline',
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
      {outlineStyle && <div aria-hidden="true" className={outlineClassName} style={outlineStyle} />}
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
