import { diagonalBorderLines, type SpreadsheetBorders } from '@einfach-excel/spreadsheet-ui-core'
import type { Rect } from '@einfach-excel/canvas'

export function paintDiagonalBorders(
  ctx: CanvasRenderingContext2D, bounds: Rect, borders?: SpreadsheetBorders,
) {
  const lines = diagonalBorderLines(borders, bounds.width, bounds.height)
  if (!lines.length) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height)
  ctx.clip()
  for (const line of lines) {
    ctx.strokeStyle = line.color
    ctx.lineWidth = line.width
    ctx.lineCap = 'butt'
    ctx.setLineDash([...line.dash])
    ctx.beginPath()
    ctx.moveTo(bounds.x + line.x1, bounds.y + line.y1)
    ctx.lineTo(bounds.x + line.x2, bounds.y + line.y2)
    ctx.stroke()
  }
  ctx.restore()
}
