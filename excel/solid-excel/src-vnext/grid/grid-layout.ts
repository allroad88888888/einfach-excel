import {
  getViewportColumnWidth,
  getViewportRowHeight,
  spillCellRoleAtom,
  type SpillCellRole,
} from '@einfach/spreadsheet-ui-core'
import { getAxisSpanSize } from './axis-geometry'
import { getSurfaceSpanPx } from './scroll-anchor'
import { getCellBackgroundStyle, getDisplayCellFormat } from './cell-format'
import { GRID_ROW_HEADER_WIDTH, makeCellKey } from './grid-constants'
import { createGridFreezeLayout } from './grid-freeze-layout'
import { createGridMergeLayout } from './grid-merge-layout'
import { installGridFeature, type GridRuntimeBase } from './grid-runtime'
import type { GridOutlineRenderPort, GridSelectionLayoutPort } from './grid-runtime-ports'
import type { GridViewStateApi } from './grid-view-state'

type GridLayoutRuntime = GridRuntimeBase &
  Pick<
    GridViewStateApi,
    | 'projectionSnapshot'
    | 'sizeOverrides'
    | 'viewportMetrics'
    | 'getHiddenRowSet'
    | 'getHiddenColSet'
    | 'visibleWindow'
  > &
  GridSelectionLayoutPort &
  GridOutlineRenderPort

export function installGridLayout(runtime: GridLayoutRuntime) {
  const {
    props,
    store,
    getCellMap,
    projectionSnapshot,
    sizeOverrides,
    viewportMetrics,
    getHiddenRowSet,
    getHiddenColSet,
    hasColOutline,
    hasRowOutline,
    getColOutlineBandHeight,
    getRowOutlineGutterWidth,
    freezeRowCount,
    freezeColCount,
    showHeadings,
    getRows,
    getCols,
    visibleWindow,
  } = runtime

  function getCell(row: number, col: number) {
    return getCellMap().get(makeCellKey(row, col))
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

  function getRowOverridesForSheet() {
    return sizeOverrides().rowHeightsBySheet[props.sheetId]
  }
  function getColOverridesForSheet() {
    return sizeOverrides().colWidthsBySheet[props.sheetId]
  }
  function getRowSpanHeight(start: number, end: number) {
    const metrics = viewportMetrics()
    return getAxisSpanSize(
      start,
      end,
      metrics.rowCount,
      metrics.rowHeight,
      getRowOverridesForSheet(),
      getHiddenRowSet(),
    )
  }
  function getColumnSpanWidth(start: number, end: number) {
    const metrics = viewportMetrics()
    return getAxisSpanSize(
      start,
      end,
      metrics.colCount,
      metrics.colWidth,
      getColOverridesForSheet(),
      getHiddenColSet(),
    )
  }

  const mergeLayout = createGridMergeLayout({
    getCell,
    projectionCells: () => projectionSnapshot().result?.cells ?? [],
    getRows,
    getCols,
    getRenderedRowHeight,
    getRenderedColumnWidth,
  })
  const freezeLayout = createGridFreezeLayout({
    hasColOutline,
    hasRowOutline,
    getColOutlineBandHeight,
    getRowOutlineGutterWidth,
    freezeRowCount,
    freezeColCount,
    showHeadings,
    getViewportRowHeight: () => viewportMetrics().rowHeight,
    getRenderedColumnWidth,
    getRenderedRowHeight,
    getRowSpanHeight,
    getColumnSpanWidth,
  })

  function getCellBoxStyle(row: number, col: number): Record<string, string> {
    const backgroundStyle = getCellBackgroundStyle(getDisplayCellFormat(getCell(row, col)))
    const stickyStyle = freezeLayout.getFrozenStickyStyle(row, col)
    const mergedSize = mergeLayout.getMergedCellBoxSize(row, col)
    return {
      ...backgroundStyle,
      ...stickyStyle,
      height: `${mergedSize?.height ?? getRenderedRowHeight(row)}px`,
      width: `${mergedSize?.width ?? getRenderedColumnWidth(col)}px`,
    }
  }

  function getScrollViewportStyle(): Record<string, string> {
    const metrics = viewportMetrics()
    return {
      width: '100%',
      height: `${metrics.viewportHeight + (showHeadings() ? metrics.rowHeight : 0) + getColOutlineBandHeight()}px`,
    }
  }

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
    return Math.max(
      0,
      getRowSpanHeight(0, visibleWindow().rowStart - 1) - runtime.dom.rowAnchorPx(),
    )
  }
  function getBottomSpacerHeight() {
    const windowEndPx = getRowSpanHeight(0, visibleWindow().rowEnd) - runtime.dom.rowAnchorPx()
    return Math.max(0, getRowScrollSurfacePx() - windowEndPx)
  }
  function getLeftSpacerWidth() {
    return Math.max(
      0,
      getColumnSpanWidth(0, visibleWindow().colStart - 1) - runtime.dom.colAnchorPx(),
    )
  }
  function getRightSpacerWidth() {
    const windowEndPx = getColumnSpanWidth(0, visibleWindow().colEnd) - runtime.dom.colAnchorPx()
    return Math.max(0, getColScrollSurfacePx() - windowEndPx)
  }
  function getVirtualColumnSpan() {
    return (
      (hasRowOutline() ? 1 : 0) +
      (showHeadings() ? 1 : 0) +
      getCols().length +
      (getLeftSpacerWidth() > 0 ? 1 : 0) +
      (getRightSpacerWidth() > 0 ? 1 : 0)
    )
  }

  return installGridFeature(runtime, {
    getCell,
    ...mergeLayout,
    getSpillRole,
    getRenderedRowHeight,
    getRenderedColumnWidth,
    ...freezeLayout,
    getCellBoxStyle,
    getScrollViewportStyle,
    getRowOverridesForSheet,
    getColOverridesForSheet,
    getRowSpanHeight,
    getColumnSpanWidth,
    getTotalRowSpanPx,
    getTotalColSpanPx,
    getRowScrollSurfacePx,
    getColScrollSurfacePx,
    getTotalTableWidth,
    getTopSpacerHeight,
    getBottomSpacerHeight,
    getLeftSpacerWidth,
    getRightSpacerWidth,
    getVirtualColumnSpan,
  })
}

export type GridLayoutApi = ReturnType<typeof installGridLayout>
