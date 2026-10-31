import { getViewportRangeRectangle, type CellRange, type ViewportMetrics,
  type ViewportSizeOverrideState } from '@einfach-excel/spreadsheet-ui-core'

interface Freeze {
  readonly rows: number
  readonly cols: number
  readonly width: number
  readonly height: number
}

/** 一个轴上裁到可见区后的起止，以及真实边是否落在可见区内（被裁掉的边不能拖）。 */
function axis(start: number, end: number, offset: number, length: number,
  firstFrozen: boolean, lastFrozen: boolean, frozenSize: number) {
  const rawStart = firstFrozen ? start : start - offset
  const rawEnd = lastFrozen ? end : end - offset
  const floor = firstFrozen ? 0 : frozenSize
  const clipStart = Math.max(floor, rawStart)
  const clipEnd = Math.min(length, rawEnd)
  return {
    start: clipStart, end: clipEnd,
    startEdge: rawStart >= floor && rawStart <= length,
    endEdge: rawEnd > (lastFrozen ? 0 : frozenSize) && rawEnd <= length,
  }
}

/** 选区或拖动落点在视口内的矩形（逻辑像素，冻结区不减滚动偏移）及四条边的可见性。 */
export function selectionEdgeGeometry(range: CellRange, metrics: ViewportMetrics,
  sizes: ViewportSizeOverrideState, freeze: Freeze | null) {
  const rect = getViewportRangeRectangle(metrics, sizes, range)
  const x = axis(rect.left, rect.left + rect.width, metrics.scrollLeft, metrics.viewportWidth,
    range.colStart < (freeze?.cols ?? 0), range.colEnd < (freeze?.cols ?? 0), freeze?.width ?? 0)
  const y = axis(rect.top, rect.top + rect.height, metrics.scrollTop, metrics.viewportHeight,
    range.rowStart < (freeze?.rows ?? 0), range.rowEnd < (freeze?.rows ?? 0), freeze?.height ?? 0)
  const width = Math.max(0, x.end - x.start)
  const height = Math.max(0, y.end - y.start)
  const visible = width > 0 && height > 0
  return {
    left: x.start, top: y.start, width, height,
    edges: {
      top: visible && y.startEdge, bottom: visible && y.endEdge,
      left: visible && x.startEdge, right: visible && x.endEdge,
    },
  }
}
