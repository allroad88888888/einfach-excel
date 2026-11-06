import { getAxisOffsetForIndex, getAxisStartIndexAtOffset } from '../viewport/axis-geometry'
import type { ViewportMetrics, ViewportSizeOverrideState } from '../viewport/types'
import { MAX_DRAWING_SIZE_PX, MIN_DRAWING_SIZE_PX, type DrawingAnchor } from './types'

type GeometrySizes = Pick<ViewportSizeOverrideState, 'rowHeightsBySheet' | 'colWidthsBySheet'>

export interface DrawingRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function axes(metrics: ViewportMetrics, sizes: GeometrySizes) {
  const sheet = metrics.sheetId ?? ''
  return {
    rowTop: (row: number) => getAxisOffsetForIndex(row, metrics.rowCount, metrics.rowHeight,
      sizes.rowHeightsBySheet[sheet]),
    colLeft: (col: number) => getAxisOffsetForIndex(col, metrics.colCount, metrics.colWidth,
      sizes.colWidthsBySheet[sheet]),
    rowAt: (y: number) => getAxisStartIndexAtOffset(y, metrics.rowCount, metrics.rowHeight,
      sizes.rowHeightsBySheet[sheet]),
    colAt: (x: number) => getAxisStartIndexAtOffset(x, metrics.colCount, metrics.colWidth,
      sizes.colWidthsBySheet[sheet]),
  }
}

/** 锚点 → 工作表内容坐标（不含行列标题、不减滚动）；与单元格共用同一套稀疏尺寸。 */
export function drawingContentRect(anchor: DrawingAnchor, metrics: ViewportMetrics,
  sizes: GeometrySizes): DrawingRect {
  const { rowTop, colLeft } = axes(metrics, sizes)
  return {
    left: colLeft(anchor.col) + anchor.offsetX,
    top: rowTop(anchor.row) + anchor.offsetY,
    width: anchor.width,
    height: anchor.height,
  }
}

const clampSize = (value: number) =>
  Math.round(Math.max(MIN_DRAWING_SIZE_PX, Math.min(MAX_DRAWING_SIZE_PX, value)))

/** 内容坐标矩形 → 锚点：左上角落在哪一格，偏移是格内剩余像素；尺寸取整并夹在允许范围。 */
export function anchorForContentRect(rect: DrawingRect, metrics: ViewportMetrics,
  sizes: GeometrySizes): DrawingAnchor {
  const { rowTop, colLeft, rowAt, colAt } = axes(metrics, sizes)
  const left = Math.max(0, rect.left)
  const top = Math.max(0, rect.top)
  const col = colAt(left)
  const row = rowAt(top)
  return {
    row,
    col,
    offsetX: Math.min(MAX_DRAWING_SIZE_PX, Math.max(0, Math.round(left - colLeft(col)))),
    offsetY: Math.min(MAX_DRAWING_SIZE_PX, Math.max(0, Math.round(top - rowTop(row)))),
    width: clampSize(rect.width),
    height: clampSize(rect.height),
  }
}

export type DrawingHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** 拖动或缩放的预览矩形；缩放从对边固定，最小尺寸不让矩形翻转。 */
export function draggedDrawingRect(start: DrawingRect, handle: DrawingHandle,
  dx: number, dy: number): DrawingRect {
  if (handle === 'move')
    return { ...start, left: Math.max(0, start.left + dx), top: Math.max(0, start.top + dy) }
  let { left, top, width, height } = start
  if (handle.includes('e')) width = Math.max(MIN_DRAWING_SIZE_PX, start.width + dx)
  if (handle.includes('s')) height = Math.max(MIN_DRAWING_SIZE_PX, start.height + dy)
  if (handle.includes('w')) {
    width = Math.max(MIN_DRAWING_SIZE_PX, start.width - dx)
    left = Math.max(0, start.left + start.width - width)
  }
  if (handle.includes('n')) {
    height = Math.max(MIN_DRAWING_SIZE_PX, start.height - dy)
    top = Math.max(0, start.top + start.height - height)
  }
  return { left, top, width, height }
}
