import type { CellCoord, CellRange } from '../shared'

export interface ViewportMetrics {
  sheetId?: string
  scrollTop: number
  scrollLeft: number
  viewportHeight: number
  viewportWidth: number
  rowHeight: number
  colWidth: number
  rowCount: number
  colCount: number
  overscanRows: number
  overscanCols: number
}

export type VisibleWindow = CellRange

export interface CellViewportRect {
  row: number
  col: number
  top: number
  left: number
  height: number
  width: number
}

export type ViewportCellAlign = 'nearest' | 'start' | 'center' | 'end'

export interface ViewportScrollPosition {
  scrollTop: number
  scrollLeft: number
}

export interface ScrollToCellInput {
  coord: CellCoord
  /** 范围放得下时整体可见；过大时仍定位 coord，不追逐屏外的末端。 */
  range?: CellRange
  rowAlign?: ViewportCellAlign
  colAlign?: ViewportCellAlign
  /** 导航事件可携带即时 DOM 测量，避免等待 ResizeObserver 时使用旧面积。 */
  viewport?: Pick<ViewportMetrics, 'viewportHeight' | 'viewportWidth'>
}

export interface ViewportSizeOverrideState {
  rowHeightsBySheet: Record<string, Record<string, number>>
  colWidthsBySheet: Record<string, Record<string, number>>
}

export interface SetViewportRowHeightInput {
  sheetId: string
  rowIndex: number
  heightPx: number
}

export interface SetViewportColumnWidthInput {
  sheetId: string
  colIndex: number
  widthPx: number
}

export interface ViewportFreezeState {
  rowsBySheet: Record<string, number>
  colsBySheet: Record<string, number>
}

export interface SetViewportFreezeInput {
  sheetId: string
  rows?: number
  cols?: number
}

export interface FrozenWindows {
  topLeft: VisibleWindow
  topRight: VisibleWindow
  bottomLeft: VisibleWindow
  bottomRight: VisibleWindow
}

export interface ViewportHiddenState {
  rowsBySheet: Record<string, number[]>
  colsBySheet: Record<string, number[]>
}

/**
 * Rows hidden because the active filter rules excluded them, keyed by
 * sheet id. Deliberately row-only: filtering has no column analogue.
 *
 * Kept apart from {@link ViewportHiddenState} (manual hide/unhide) because
 * the two sets are not interchangeable — SUBTOTAL 1-11 excludes only the
 * filter set, copy skips only the filter set, and `Unhide Rows` must never
 * clear it. Consumers that only care about "is this row painted?" read the
 * union via `effectiveHiddenAtom`.
 */
export interface ViewportFilterHiddenState {
  rowsBySheet: Record<string, number[]>
}
