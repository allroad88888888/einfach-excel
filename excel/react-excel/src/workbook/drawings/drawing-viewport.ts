import type { DrawingAnchor, DrawingRect, ViewportMetrics } from '@einfach-excel/spreadsheet-ui-core'

export interface DrawingFreeze {
  readonly rows: number
  readonly cols: number
  readonly width: number
  readonly height: number
}

export interface DrawingViewportBox {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  /** clip-path inset：滚动区对象不能盖住行列标题和冻结窗格。 */
  readonly clipTop: number
  readonly clipLeft: number
  readonly visible: boolean
}

/**
 * 内容坐标 → 浮层坐标（含行列标题宽高）。锚点在冻结行/列内的轴不减滚动偏移，
 * 与填充柄、冻结窗格同一规则。
 */
export function drawingViewportBox(rect: DrawingRect, anchor: DrawingAnchor,
  metrics: ViewportMetrics, freeze: DrawingFreeze | null,
  gutter: number, heading: number): DrawingViewportBox {
  const frozenCol = anchor.col < (freeze?.cols ?? 0)
  const frozenRow = anchor.row < (freeze?.rows ?? 0)
  const left = gutter + rect.left - (frozenCol ? 0 : metrics.scrollLeft)
  const top = heading + rect.top - (frozenRow ? 0 : metrics.scrollTop)
  const minLeft = gutter + (frozenCol ? 0 : freeze?.width ?? 0)
  const minTop = heading + (frozenRow ? 0 : freeze?.height ?? 0)
  const clipLeft = Math.max(0, minLeft - left)
  const clipTop = Math.max(0, minTop - top)
  const visible = clipLeft < rect.width && clipTop < rect.height &&
    left < gutter + metrics.viewportWidth && top < heading + metrics.viewportHeight
  return { left, top, width: rect.width, height: rect.height, clipLeft, clipTop, visible }
}
