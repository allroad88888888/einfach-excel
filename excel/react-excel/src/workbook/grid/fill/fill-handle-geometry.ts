import { getViewportRangeRectangle, type CellRange, type ViewportMetrics,
  type ViewportSizeOverrideState } from '@einfach/spreadsheet-ui-core'

/** 把工作表范围裁到可见区域；冻结区不减滚动偏移，滚动区不能穿过冻结遮罩。 */
export function fillHandleGeometry(
  range: CellRange, metrics: ViewportMetrics, sizes: ViewportSizeOverrideState,
  freeze: { rows: number; cols: number; width: number; height: number } | null,
) {
  const rect = getViewportRangeRectangle(metrics, sizes, range)
  const axis = (start: number, end: number, offset: number, length: number,
    firstFrozen: boolean, lastFrozen: boolean, frozenSize: number) => {
    const left = firstFrozen ? start : Math.max(frozenSize, start - offset)
    const right = end - (lastFrozen ? 0 : offset)
    return { start: Math.max(0, left), end: Math.min(length, right),
      corner: right, visible: right > (lastFrozen ? 0 : frozenSize) && right <= length }
  }
  const x = axis(rect.left, rect.left + rect.width, metrics.scrollLeft, metrics.viewportWidth,
    range.colStart < (freeze?.cols ?? 0), range.colEnd < (freeze?.cols ?? 0), freeze?.width ?? 0)
  const y = axis(rect.top, rect.top + rect.height, metrics.scrollTop, metrics.viewportHeight,
    range.rowStart < (freeze?.rows ?? 0), range.rowEnd < (freeze?.rows ?? 0), freeze?.height ?? 0)
  return { left: x.start, top: y.start, width: Math.max(0, x.end - x.start),
    height: Math.max(0, y.end - y.start), cornerX: x.corner, cornerY: y.corner,
    cornerVisible: x.visible && y.visible && rect.width > 0 && rect.height > 0 }
}
