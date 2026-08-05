import {
  getViewportColumnWidth,
  getViewportRowHeight,
  isMergeCovered,
  spillCellRoleAtom,
  viewportSizeOverridesAtom,
  type CellRange,
  type DisplayCell,
  type SpillCellRole,
} from '@einfach/spreadsheet-ui-core'
import { getAxisSpanSize } from './axis-geometry'
import { getSurfaceSpanPx } from './scroll-anchor'
import { getCellBackgroundStyle, getDisplayCellFormat } from './cell-format'
import { GRID_ROW_HEADER_WIDTH, isCoordInRange, makeCellKey } from './grid-constants'
import { type GridRuntime } from './grid-runtime'

export function installGridLayout(runtime: GridRuntime) {
  const { props, store, getCellMap, projectionSnapshot, sizeOverrides, viewportMetrics, getHiddenRowSet, getHiddenColSet, hasColOutline, hasRowOutline, getColOutlineBandHeight, getRowOutlineGutterWidth, freezeRowCount, freezeColCount, showHeadings, getRows, getCols, visibleWindow } = runtime

  function getCell(row: number, col: number) {
    return getCellMap().get(makeCellKey(row, col))
  }

  function getMergeRangeForCell(cell: DisplayCell | undefined): CellRange | null {
    if (!cell?.mergedSpan) return null
    const rows = Math.max(1, Math.trunc(cell.mergedSpan.rows))
    const cols = Math.max(1, Math.trunc(cell.mergedSpan.cols))
    return { rowStart: cell.row, rowEnd: cell.row + rows - 1, colStart: cell.col, colEnd: cell.col + cols - 1 }
  }

  function getMergeRangeForCoord(row: number, col: number): CellRange | null {
    const cell = getCell(row, col)
    const direct = getMergeRangeForCell(cell)
    if (direct) return direct
    if (cell?.mergeAnchor) return getMergeRangeForCell(getCell(cell.mergeAnchor.row, cell.mergeAnchor.col))
    for (const candidate of projectionSnapshot().result?.cells ?? []) {
      const range = getMergeRangeForCell(candidate)
      if (range && isCoordInRange(row, col, range)) return range
    }
    return null
  }

  function isCellCoveredByMerge(row: number, col: number) {
    const cell = getCell(row, col)
    if (cell && isMergeCovered(cell)) return true
    const range = getMergeRangeForCoord(row, col)
    return range !== null && (range.rowStart !== row || range.colStart !== col)
  }

  function isCellMergeAnchor(row: number, col: number) {
    const range = getMergeRangeForCoord(row, col)
    return range !== null && range.rowStart === row && range.colStart === col
  }

  function getSpillRole(row: number, col: number): SpillCellRole | undefined {
    projectionSnapshot()
    return store.getter(spillCellRoleAtom)(props.sheetId, { row, col }) ?? undefined
  }

  function getRenderedRowHeight(row: number) {
    return getViewportRowHeight(sizeOverrides(), props.sheetId, row, props.viewport.rowHeight)
  }

  function getRenderedColumnWidth(col: number) {
    return getViewportColumnWidth(sizeOverrides(), props.sheetId, col, props.viewport.colWidth)
  }

  function getColumnStyle(col: number): Record<string, string> {
    const style: Record<string, string> = { width: `${getRenderedColumnWidth(col)}px` }
    if (hasColOutline()) style.top = `${getColOutlineBandHeight()}px`
    if (col < freezeColCount()) {
      const headingWidth = showHeadings() ? GRID_ROW_HEADER_WIDTH : 0
      const stackedLeft = col === 0 ? 0 : getColumnSpanWidth(0, col - 1)
      style.left = `${getRowOutlineGutterWidth() + headingWidth + stackedLeft}px`
    }
    return style
  }

  function getFrozenStickyStyle(row: number, col: number): Record<string, string> {
    const style: Record<string, string> = {}
    const frozenRows = freezeRowCount()
    const frozenCols = freezeColCount()
    if (frozenRows > 0 && row < frozenRows) {
      const headingHeight = showHeadings() ? viewportMetrics().rowHeight : 0
      const stackedAbove = row === 0 ? 0 : getRowSpanHeight(0, row - 1)
      style.top = `${getColOutlineBandHeight() + headingHeight + stackedAbove}px`
    }
    if (frozenCols > 0 && col < frozenCols) {
      const headingWidth = showHeadings() ? GRID_ROW_HEADER_WIDTH : 0
      const stackedLeft = col === 0 ? 0 : getColumnSpanWidth(0, col - 1)
      style.left = `${getRowOutlineGutterWidth() + headingWidth + stackedLeft}px`
    }
    return style
  }

  function getCellBoxStyle(row: number, col: number): Record<string, string> {
    const backgroundStyle = getCellBackgroundStyle(getDisplayCellFormat(getCell(row, col)))
    const stickyStyle = getFrozenStickyStyle(row, col)
    const mergeRange = getMergeRangeForCoord(row, col)
    if (mergeRange && mergeRange.rowStart === row && mergeRange.colStart === col) {
      const height = getRows().filter((index: number) => index >= row && index <= mergeRange.rowEnd).reduce((sum: number, index: number) => sum + getRenderedRowHeight(index), 0)
      const width = getCols().filter((index: number) => index >= col && index <= mergeRange.colEnd).reduce((sum: number, index: number) => sum + getRenderedColumnWidth(index), 0)
      return { ...backgroundStyle, ...stickyStyle, height: `${Math.max(getRenderedRowHeight(row), height)}px`, width: `${Math.max(getRenderedColumnWidth(col), width)}px` }
    }
    return { ...backgroundStyle, ...stickyStyle, height: `${getRenderedRowHeight(row)}px`, width: `${getRenderedColumnWidth(col)}px` }
  }

  function getCellRowSpan(row: number, col: number) {
    const range = getMergeRangeForCoord(row, col)
    return !range || range.rowStart !== row || range.colStart !== col ? 1 : Math.max(1, getRows().filter((index: number) => index >= row && index <= range.rowEnd).length)
  }

  function getCellColSpan(row: number, col: number) {
    const range = getMergeRangeForCoord(row, col)
    return !range || range.rowStart !== row || range.colStart !== col ? 1 : Math.max(1, getCols().filter((index: number) => index >= col && index <= range.colEnd).length)
  }

  function getRowHeaderStyle(row: number): Record<string, string> {
    const style: Record<string, string> = { height: `${getRenderedRowHeight(row)}px` }
    if (hasRowOutline()) style.left = `${getRowOutlineGutterWidth()}px`
    if (row < freezeRowCount()) {
      const headingHeight = showHeadings() ? viewportMetrics().rowHeight : 0
      const stackedAbove = row === 0 ? 0 : getRowSpanHeight(0, row - 1)
      style.top = `${getColOutlineBandHeight() + headingHeight + stackedAbove}px`
    }
    return style
  }

  function getCornerStyle(): Record<string, string> {
    const style: Record<string, string> = {}
    if (hasRowOutline()) style.left = `${getRowOutlineGutterWidth()}px`
    if (hasColOutline()) style.top = `${getColOutlineBandHeight()}px`
    return style
  }

  function getScrollViewportStyle(): Record<string, string> {
    const metrics = viewportMetrics()
    return { width: '100%', height: `${metrics.viewportHeight + (showHeadings() ? metrics.rowHeight : 0) + getColOutlineBandHeight()}px` }
  }

  function getRowOverridesForSheet() { return store.getter(viewportSizeOverridesAtom).rowHeightsBySheet[props.sheetId] }
  function getColOverridesForSheet() { return store.getter(viewportSizeOverridesAtom).colWidthsBySheet[props.sheetId] }
  function getRowSpanHeight(start: number, end: number) { const metrics = viewportMetrics(); return getAxisSpanSize(start, end, metrics.rowCount, metrics.rowHeight, getRowOverridesForSheet(), getHiddenRowSet()) }
  function getColumnSpanWidth(start: number, end: number) { const metrics = viewportMetrics(); return getAxisSpanSize(start, end, metrics.colCount, metrics.colWidth, getColOverridesForSheet(), getHiddenColSet()) }
  // Anchored scroll surface (issue #5): the DOM table spans only
  // min(整表, 5×视口) per axis; the spacers position the rendered window
  // inside that surface relative to the axis anchor (runtime.rowAnchorPx /
  // colAnchorPx, maintained by grid-projection-controller). A frozen axis
  // keeps its full span — its window stays pinned to origin, so the anchor
  // stays 0 and the axis retains the legacy full-height geometry.
  function getTotalRowSpanPx() {
    const metrics = viewportMetrics()
    return getRowSpanHeight(0, metrics.rowCount - 1)
  }
  function getTotalColSpanPx() {
    const metrics = viewportMetrics()
    return getColumnSpanWidth(0, metrics.colCount - 1)
  }
  function getRowScrollSurfacePx() {
    const total = getTotalRowSpanPx()
    return freezeRowCount() > 0 ? total : getSurfaceSpanPx(total, viewportMetrics().viewportHeight)
  }
  function getColScrollSurfacePx() {
    const total = getTotalColSpanPx()
    return freezeColCount() > 0 ? total : getSurfaceSpanPx(total, viewportMetrics().viewportWidth)
  }
  function getTotalTableWidth() {
    const headingWidth = showHeadings() ? GRID_ROW_HEADER_WIDTH : 0
    return getRowOutlineGutterWidth() + headingWidth + getColScrollSurfacePx()
  }
  function getTopSpacerHeight() {
    return Math.max(0, getRowSpanHeight(0, visibleWindow().rowStart - 1) - runtime.rowAnchorPx)
  }
  function getBottomSpacerHeight() {
    const windowEndPx = getRowSpanHeight(0, visibleWindow().rowEnd) - runtime.rowAnchorPx
    return Math.max(0, getRowScrollSurfacePx() - windowEndPx)
  }
  function getLeftSpacerWidth() {
    return Math.max(0, getColumnSpanWidth(0, visibleWindow().colStart - 1) - runtime.colAnchorPx)
  }
  function getRightSpacerWidth() {
    const windowEndPx = getColumnSpanWidth(0, visibleWindow().colEnd) - runtime.colAnchorPx
    return Math.max(0, getColScrollSurfacePx() - windowEndPx)
  }
  function getVirtualColumnSpan() { return (hasRowOutline() ? 1 : 0) + (showHeadings() ? 1 : 0) + getCols().length + (getLeftSpacerWidth() > 0 ? 1 : 0) + (getRightSpacerWidth() > 0 ? 1 : 0) }

  Object.assign(runtime, { getCell, getMergeRangeForCell, getMergeRangeForCoord, isCellCoveredByMerge, isCellMergeAnchor, getSpillRole, getRenderedRowHeight, getRenderedColumnWidth, getColumnStyle, getFrozenStickyStyle, getCellBoxStyle, getCellRowSpan, getCellColSpan, getRowHeaderStyle, getCornerStyle, getScrollViewportStyle, getRowOverridesForSheet, getColOverridesForSheet, getRowSpanHeight, getColumnSpanWidth, getTotalRowSpanPx, getTotalColSpanPx, getRowScrollSurfacePx, getColScrollSurfacePx, getTotalTableWidth, getTopSpacerHeight, getBottomSpacerHeight, getLeftSpacerWidth, getRightSpacerWidth, getVirtualColumnSpan })
}
