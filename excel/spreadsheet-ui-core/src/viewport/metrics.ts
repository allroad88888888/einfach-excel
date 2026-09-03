import { atom } from '@einfach/core'
import type { CellCoord } from '../shared'
import type {
  CellViewportRect,
  ScrollToCellInput,
  ViewportCellAlign,
  ViewportMetrics,
  ViewportScrollPosition,
} from './types'

export const DEFAULT_VIEWPORT_METRICS: ViewportMetrics = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportHeight: 0,
  viewportWidth: 0,
  rowHeight: 24,
  colWidth: 96,
  rowCount: 0,
  colCount: 0,
  overscanRows: 2,
  overscanCols: 2,
}

function normalizeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function normalizeCount(value: number): number {
  return Math.max(0, Math.trunc(normalizeNumber(value, 0)))
}

function normalizePositive(value: number, fallback: number): number {
  return Math.max(1, normalizeNumber(value, fallback))
}

function normalizeOverscan(value: number): number {
  return Math.max(0, Math.trunc(normalizeNumber(value, 0)))
}

/** Internal index clamp shared by viewport geometry calculations. */
export function clampViewportIndex(value: number, maxExclusive: number): number {
  if (maxExclusive <= 0 || value < 0) return 0
  return value >= maxExclusive ? maxExclusive - 1 : value
}

/** Internal pixel clamp shared by viewport geometry calculations. */
export function clampViewportOffset(value: number, max: number): number {
  return Math.max(0, Math.min(normalizeNumber(value, 0), Math.max(0, max)))
}

export function normalizeViewportMetrics(metrics: ViewportMetrics): ViewportMetrics {
  const rowHeight = normalizePositive(metrics.rowHeight, DEFAULT_VIEWPORT_METRICS.rowHeight)
  const colWidth = normalizePositive(metrics.colWidth, DEFAULT_VIEWPORT_METRICS.colWidth)
  const rowCount = normalizeCount(metrics.rowCount)
  const colCount = normalizeCount(metrics.colCount)
  const viewportHeight = Math.max(0, normalizeNumber(metrics.viewportHeight, 0))
  const viewportWidth = Math.max(0, normalizeNumber(metrics.viewportWidth, 0))

  return {
    scrollTop: clampViewportOffset(metrics.scrollTop, rowCount * rowHeight - viewportHeight),
    scrollLeft: clampViewportOffset(metrics.scrollLeft, colCount * colWidth - viewportWidth),
    viewportHeight,
    viewportWidth,
    rowHeight,
    colWidth,
    rowCount,
    colCount,
    overscanRows: normalizeOverscan(metrics.overscanRows),
    overscanCols: normalizeOverscan(metrics.overscanCols),
  }
}

export function getCellViewportRect(coord: CellCoord, metrics: ViewportMetrics): CellViewportRect {
  const normalized = normalizeViewportMetrics(metrics)
  const row = clampViewportIndex(coord.row, normalized.rowCount)
  const col = clampViewportIndex(coord.col, normalized.colCount)
  return {
    row,
    col,
    top: row * normalized.rowHeight - normalized.scrollTop,
    left: col * normalized.colWidth - normalized.scrollLeft,
    height: normalized.rowHeight,
    width: normalized.colWidth,
  }
}

export function getViewportScrollForCell(
  metrics: ViewportMetrics,
  input: ScrollToCellInput,
): ViewportScrollPosition {
  const normalized = normalizeViewportMetrics(metrics)
  const row = clampViewportIndex(input.coord.row, normalized.rowCount)
  const col = clampViewportIndex(input.coord.col, normalized.colCount)
  return {
    scrollTop: getAlignedScrollOffset({
      align: input.rowAlign ?? 'nearest',
      current: normalized.scrollTop,
      viewportSize: normalized.viewportHeight,
      cellStart: row * normalized.rowHeight,
      cellSize: normalized.rowHeight,
      totalSize: normalized.rowCount * normalized.rowHeight,
    }),
    scrollLeft: getAlignedScrollOffset({
      align: input.colAlign ?? 'nearest',
      current: normalized.scrollLeft,
      viewportSize: normalized.viewportWidth,
      cellStart: col * normalized.colWidth,
      cellSize: normalized.colWidth,
      totalSize: normalized.colCount * normalized.colWidth,
    }),
  }
}

export const viewportMetricsAtom = atom<ViewportMetrics>(DEFAULT_VIEWPORT_METRICS)
viewportMetricsAtom.debugLabel = 'spreadsheet.viewport.metrics'

export const setViewportMetricsAtom = atom(
  (get) => get(viewportMetricsAtom),
  (_get, set, metrics: ViewportMetrics) => {
    set(viewportMetricsAtom, normalizeViewportMetrics(metrics))
  },
)
setViewportMetricsAtom.debugLabel = 'spreadsheet.viewport.setMetrics'

export const scrollToCellAtom = atom(
  (get) => get(viewportMetricsAtom),
  (get, set, input: ScrollToCellInput): ViewportScrollPosition => {
    const metrics = get(viewportMetricsAtom)
    const scrollPosition = getViewportScrollForCell(metrics, input)
    set(viewportMetricsAtom, { ...metrics, ...scrollPosition })
    return scrollPosition
  },
)
scrollToCellAtom.debugLabel = 'spreadsheet.viewport.scrollToCell'

function getAlignedScrollOffset(input: {
  align: ViewportCellAlign
  current: number
  viewportSize: number
  cellStart: number
  cellSize: number
  totalSize: number
}): number {
  const cellEnd = input.cellStart + input.cellSize
  const viewportEnd = input.current + input.viewportSize
  let next = input.current
  switch (input.align) {
    case 'start':
      next = input.cellStart
      break
    case 'center':
      next = input.cellStart - (input.viewportSize - input.cellSize) / 2
      break
    case 'end':
      next = cellEnd - input.viewportSize
      break
    case 'nearest':
      if (input.cellStart < input.current) next = input.cellStart
      else if (cellEnd > viewportEnd) next = cellEnd - input.viewportSize
      break
  }
  return clampViewportOffset(next, input.totalSize - input.viewportSize)
}
