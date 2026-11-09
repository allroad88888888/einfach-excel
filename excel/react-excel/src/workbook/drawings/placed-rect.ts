import { drawingContentRect, getViewportRangeRectangle, type DrawingRect, type SheetDrawing,
  type ViewportMetrics } from '@einfach-excel/spreadsheet-ui-core'
import type { DrawingContribution } from '../../plugin/types'

type Sizes = Parameters<typeof drawingContentRect>[2]

/**
 * 对象在内容坐标里的矩形：浮动对象按锚点与尺寸；格内对象（`placement: 'cell'`）
 * 铺满第一个引用区域，随行高列宽变化，所在行列隐藏时返回 null（不画）。
 */
export function placedDrawingRect(drawing: SheetDrawing,
  contribution: DrawingContribution | undefined, metrics: ViewportMetrics,
  sizes: Sizes): DrawingRect | null {
  if (contribution?.placement !== 'cell') return drawingContentRect(drawing.anchor, metrics, sizes)
  const range = drawing.refs[0]
  if (!range || (range.sheetId && range.sheetId !== metrics.sheetId)) return null
  const rect = getViewportRangeRectangle(metrics, sizes, { rowStart: range.startRow,
    rowEnd: range.endRow, colStart: range.startCol, colEnd: range.endCol })
  return rect.width > 0 && rect.height > 0 ? rect : null
}
