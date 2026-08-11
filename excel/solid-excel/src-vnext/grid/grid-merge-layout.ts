import { isMergeCovered, type CellRange, type DisplayCell } from '@einfach/spreadsheet-ui-core'
import { isCoordInRange } from './grid-constants'

interface GridMergeLayoutInput {
  getCell: (row: number, col: number) => DisplayCell | undefined
  projectionCells: () => readonly DisplayCell[]
  getRows: () => readonly number[]
  getCols: () => readonly number[]
  getRenderedRowHeight: (row: number) => number
  getRenderedColumnWidth: (col: number) => number
}

function getRangeForCell(cell: DisplayCell | undefined): CellRange | null {
  if (!cell?.mergedSpan) return null
  const rows = Math.max(1, Math.trunc(cell.mergedSpan.rows))
  const cols = Math.max(1, Math.trunc(cell.mergedSpan.cols))
  return {
    rowStart: cell.row,
    rowEnd: cell.row + rows - 1,
    colStart: cell.col,
    colEnd: cell.col + cols - 1,
  }
}

function getRenderedIndexes(indexes: readonly number[], start: number, end: number) {
  return indexes.filter((index) => index >= start && index <= end)
}

/** Resolves projection merge metadata into table spans and rendered box sizes. */
export function createGridMergeLayout(input: GridMergeLayoutInput) {
  let rangesSource: readonly DisplayCell[] | null = null
  let rangesCache: CellRange[] = []

  function getMergeRanges(): readonly CellRange[] {
    const cells = input.projectionCells()
    if (cells !== rangesSource) {
      rangesCache = cells.flatMap((cell) => {
        const range = getRangeForCell(cell)
        return range ? [range] : []
      })
      rangesSource = cells
    }
    return rangesCache
  }

  function getMergeRangeForCoord(row: number, col: number): CellRange | null {
    const cell = input.getCell(row, col)
    const directRange = getRangeForCell(cell)
    if (directRange) return directRange
    if (cell?.mergeAnchor) {
      const anchorRange = getRangeForCell(input.getCell(cell.mergeAnchor.row, cell.mergeAnchor.col))
      if (anchorRange) return anchorRange
    }
    return getMergeRanges().find((range) => isCoordInRange(row, col, range)) ?? null
  }

  function isCellCoveredByMerge(row: number, col: number) {
    const cell = input.getCell(row, col)
    if (cell && isMergeCovered(cell)) return true
    const range = getMergeRangeForCoord(row, col)
    return range !== null && (range.rowStart !== row || range.colStart !== col)
  }

  function isCellMergeAnchor(row: number, col: number) {
    const range = getMergeRangeForCoord(row, col)
    return range !== null && range.rowStart === row && range.colStart === col
  }

  function getMergedCellBoxSize(row: number, col: number) {
    const range = getMergeRangeForCoord(row, col)
    if (!range || range.rowStart !== row || range.colStart !== col) return null
    const height = getRenderedIndexes(input.getRows(), row, range.rowEnd).reduce(
      (sum, index) => sum + input.getRenderedRowHeight(index),
      0,
    )
    const width = getRenderedIndexes(input.getCols(), col, range.colEnd).reduce(
      (sum, index) => sum + input.getRenderedColumnWidth(index),
      0,
    )
    return {
      height: Math.max(input.getRenderedRowHeight(row), height),
      width: Math.max(input.getRenderedColumnWidth(col), width),
    }
  }

  function getCellRowSpan(row: number, col: number) {
    const range = getMergeRangeForCoord(row, col)
    if (!range || range.rowStart !== row || range.colStart !== col) return 1
    return Math.max(1, getRenderedIndexes(input.getRows(), row, range.rowEnd).length)
  }

  function getCellColSpan(row: number, col: number) {
    const range = getMergeRangeForCoord(row, col)
    if (!range || range.rowStart !== row || range.colStart !== col) return 1
    return Math.max(1, getRenderedIndexes(input.getCols(), col, range.colEnd).length)
  }

  return {
    getMergeRangeForCell: getRangeForCell,
    getMergeRangeForCoord,
    isCellCoveredByMerge,
    isCellMergeAnchor,
    getMergedCellBoxSize,
    getCellRowSpan,
    getCellColSpan,
  }
}
