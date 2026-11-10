import type { CellRange, DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import {
  centerAcrossRun, nativeFilterRangeAtom, nativeTableFiltersAtom,
  formulaReferenceSessionAtom, projectionSnapshotAtom, viewportMetricsAtom, showFormulasAtom,
  formulaViewText, selectionRangesAtom,
} from '@einfach-excel/spreadsheet-ui-core'
import { useAtomValue } from '@einfach/react'
import { CellFilterButton } from './CellFilterButton'
import { CellDataBar } from './CellDataBar'
import { RichCellText } from './RichCellText'
import { CellHyperlink } from './hyperlink/CellHyperlink'
import { CellMetadata, type CellMetadataLabels } from './cell-metadata/CellMetadata'
import { SelectionOutlines } from './SelectionOutlines'
import { useMemo, type CSSProperties } from 'react'
import { cellFormatStyle, cellTextRotationStyle } from './cell-format-style'
import { centerAcrossSpanWidth, centerAcrossStyles } from './center-across-style'
import { createGridBorderStyles } from './grid-border-style'
import { DEFAULT_CELL_ROW_HEIGHT } from './grid-defaults'
// 样式随真正渲染表格的模块导入：纯转出的 index.ts 会被生产构建跳过，连同它的 CSS 一起丢失。
import './cells.css'

/** Inputs for the controlled, read-only spreadsheet grid projection. */
export interface SpreadsheetGridProps {
  readonly window: CellRange
  readonly cells: readonly DisplayCell[]
  readonly mergedRanges?: readonly CellRange[]
  readonly selected?: CellRange
  readonly rowHeights?: readonly number[]
  readonly columnWidths?: readonly number[]
  readonly metadataLabels?: CellMetadataLabels
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
export function SpreadsheetGrid({
  window,
  cells,
  mergedRanges,
  selected: selectionRange,
  rowHeights,
  columnWidths,
  metadataLabels,
}: SpreadsheetGridProps) {
  const filterRange = useAtomValue(nativeFilterRangeAtom)
  const tableFilters = useAtomValue(nativeTableFiltersAtom)
  const reference = useAtomValue(formulaReferenceSessionAtom)
  const projection = useAtomValue(projectionSnapshotAtom).result
  const metrics = useAtomValue(viewportMetricsAtom)
  const showFormulas = useAtomValue(showFormulasAtom)
  const ranges = useAtomValue(selectionRangesAtom)
  // Native scrolling moves this table without changing its sheet coordinates.
  // Only crossing the origin changes frozen border adjacency; pixel offsets
  // must not rebuild every cell in the buffered projection on each scroll.
  const atTop = metrics.scrollTop === 0, atLeft = metrics.scrollLeft === 0
  return useMemo(() => {
    const picked = reference?.pickAnchor && reference.pickFocus ? {
      rowStart: Math.min(reference.pickAnchor.row, reference.pickFocus.row),
      rowEnd: Math.max(reference.pickAnchor.row, reference.pickFocus.row),
      colStart: Math.min(reference.pickAnchor.col, reference.pickFocus.col),
      colEnd: Math.max(reference.pickAnchor.col, reference.pickFocus.col),
    } : undefined
    const selected = picked ? [picked] : selectionRange ? [selectionRange] : ranges
    const cellsByCoordinate = new Map(cells.map((cell) => [`${cell.row}:${cell.col}`, cell]))
    const borderStyle = createGridBorderStyles({ cells, window, rowHeights, columnWidths,
      projection: projection?.kind === 'visible-window' ? projection : undefined,
      scrollTop: atTop ? 0 : 1, scrollLeft: atLeft ? 0 : 1,
    })
    const rows = []

    for (let row = window.rowStart; row <= window.rowEnd; row += 1) {
      if (rowHeights?.[row - window.rowStart] === 0) continue
      const rowCells = []
      const tableHeaders = tableFilters.filter((target) => target.range.rowStart === row)
      const rowMerges = mergedRanges?.filter(
        range => range.rowStart <= row && row <= range.rowEnd,
      ) ?? []

      for (let col = window.colStart; col <= window.colEnd; col += 1) {
        if (columnWidths?.[col - window.colStart] === 0) continue
        const cell = cellsByCoordinate.get(`${row}:${col}`)
        const merged = rowMerges.some(range => range.colStart <= col && col <= range.colEnd)
        const isSelected = selected.some((range) => isSelectedCell(range, row, col))
        const rotationStyle = cellTextRotationStyle(cell?.format)
        const run = !merged && columnWidths
          ? centerAcrossRun((r, c) => cellsByCoordinate.get(`${r}:${c}`), row, col, window.colEnd)
          : null
        const across = run && run.colEnd > run.colStart && columnWidths
          ? centerAcrossStyles(centerAcrossSpanWidth(run, window.colStart, columnWidths))
          : undefined
        const formatStyle = {
          ...cellFormatStyle(
            cell?.format ? { ...cell.format, borders: undefined,
              ...(cell.richText?.length && !showFormulas
                ? { underline: false, strikethrough: false } : {}) } : undefined, cell?.valueKind,
          ),
          ...borderStyle(row, col, cell?.format),
          ...across?.cell,
        }
        const height = rowHeights?.[row - window.rowStart] ?? DEFAULT_CELL_ROW_HEIGHT
        // table 的内容上限扣除真实边框；16px 行高也不能被大字或粗边框反向撑开。
        const topBorder = Number.parseFloat(
          String(formatStyle.borderTopWidth ?? (formatStyle.borderTopStyle ? 3 : 0)),
        )
        const bottomBorder = Number.parseFloat(String(formatStyle.borderBottomWidth ?? 1))
        const text = formulaViewText(cell, showFormulas)
        // Keep the common plain-text path as a text node: thousands of redundant
        // component fibers otherwise delay buffered viewport replacement on scroll.
        const displayValue = cell?.richText?.length && !showFormulas
          ? <RichCellText cell={cell} text={text} showFormulas={false} />
          : text
        const filterTable = tableHeaders.find(({ range }) =>
          col >= range.colStart && col <= range.colEnd)?.table
        const filterHeader = !merged && (filterTable !== undefined || row === filterRange?.rowStart
          && col >= filterRange.colStart && col <= filterRange.colEnd)

        rowCells.push(
          <td
            key={col}
            className={`cell cell-metadata-host${isSelected ? ' cell-selected' : ''}${filterHeader ? ' cell-filter-header' : ''}${cell?.dataBar && !merged ? ' cell-data-bar-host' : ''}`}
            data-cell={`${row}:${col}`}
            title={showFormulas ? cell?.formula : undefined}
            aria-hidden={merged || undefined}
            data-selected={isSelected ? 'true' : undefined}
            data-center-across={run && across ? run.colEnd - run.colStart + 1 : undefined}
            style={formatStyle}
          >
            {!merged && cell?.dataBar && <CellDataBar bar={cell.dataBar} />}
            {!merged && (cell?.conditionalIcon || cell?.noteIndicator || cell?.commentIndicator ||
              cell?.commentThreadId) && <CellMetadata cell={cell} labels={metadataLabels} />}
            <span
              className="cell-content"
              data-conditional-icon-value={!merged && cell?.conditionalIcon
                ? cell.conditionalIcon.showValue ? 'visible' : 'hidden' : undefined}
              style={{
                maxHeight: Math.max(0, height - 6 - topBorder - bottomBorder),
                visibility: merged ? 'hidden' : undefined,
                ...across?.content,
              }}
            >
              {cell?.hyperlink && !showFormulas ? (
                <CellHyperlink url={cell.hyperlink} color={cell.format?.fgColor}>
                  {rotationStyle ? <span className="cell-rotated-text" style={rotationStyle}>
                    {displayValue}</span> : displayValue}
                </CellHyperlink>
              ) : rotationStyle ? <span className="cell-rotated-text" style={rotationStyle}>
                {displayValue}</span> : displayValue}
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
        <SelectionOutlines window={window} ranges={selected} rowHeights={rowHeights}
          columnWidths={columnWidths} reference={Boolean(picked)} />
      </>
    )
  }, [window, cells, mergedRanges, selectionRange, rowHeights, columnWidths, metadataLabels,
    filterRange, tableFilters, reference, projection, showFormulas, ranges, atTop, atLeft])
}
