import { formulaViewText } from '@einfach/spreadsheet-ui-core'
import type { BorderSegment, CanvasCellsTheme, CellPaintModel } from './types'
import { paintText } from './text'

function paintBorder(ctx: CanvasRenderingContext2D, segment: BorderSegment, gridline: string) {
  const { side, bounds: b } = segment
  // Clearing an explicit border restores the ordinary gridline, as in the React renderer.
  const border = segment.border?.style === 'none' ? undefined : segment.border
  const width = border?.style === 'thick' || border?.style === 'double' ? 3
    : border?.style === 'medium' ? 2 : 1
  ctx.strokeStyle = gridline
  if (border?.color) ctx.strokeStyle = border.color
  ctx.lineWidth = border?.style === 'double' ? 1 : width
  ctx.setLineDash(border?.style === 'dashed' ? [4, 3] : border?.style === 'dotted' ? [1, 2] : [])
  const horizontal = side === 'top' || side === 'bottom'
  const direction = side === 'top' || side === 'left' ? 1 : -1
  const edge = side === 'top' ? b.y : side === 'bottom' ? b.y + b.height
    : side === 'left' ? b.x : b.x + b.width
  for (const inset of border?.style === 'double' ? [0.5, 2.5] : [width / 2]) {
    const position = edge + direction * inset
    ctx.beginPath()
    ctx.moveTo(horizontal ? b.x : position, horizontal ? position : b.y)
    ctx.lineTo(horizontal ? b.x + b.width : position, horizontal ? position : b.y + b.height)
    ctx.stroke()
  }
  ctx.setLineDash([])
}
export function paintCell(
  ctx: CanvasRenderingContext2D, model: CellPaintModel, theme: CanvasCellsTheme,
) {
  const { item, appearance: a } = model
  const b = item.bounds, cell = item.cell
  ctx.fillStyle = theme.background
  if (cell?.format?.bgColor) ctx.fillStyle = cell.format.bgColor
  ctx.fillRect(b.x, b.y, b.width, b.height)
  if (a.selected) { ctx.fillStyle = theme.selectionFill; ctx.fillRect(b.x, b.y, b.width, b.height) }
  if (a.hovered) { ctx.fillStyle = theme.hover; ctx.fillRect(b.x, b.y, b.width, b.height) }
  const bar = cell?.dataBar
  if (bar) {
    ctx.save(); ctx.globalAlpha = 0.6; ctx.fillStyle = bar.color
    const width = Math.max(0, b.width - 4)
    ctx.fillRect(b.x + 2 + width * bar.left / 100, b.y + 3,
      width * bar.width / 100, Math.max(0, b.height - 6))
    ctx.restore()
    if (bar.axis !== undefined) {
      ctx.fillStyle = theme.foreground
      ctx.fillRect(b.x + 2 + width * bar.axis / 100, b.y + 3, 1, Math.max(0, b.height - 6))
    }
  }
  paintText(ctx, b, cell, formulaViewText(cell, a.showFormulas), theme, Boolean(a.filter),
    a.showFormulas)
  for (const border of item.borders) paintBorder(ctx, border, theme.gridline)
  if (a.filter) {
    const x = b.x + b.width - 21, y = b.y + b.height / 2 - 10
    ctx.fillStyle = theme.background; ctx.fillRect(x, y, 19, 20)
    ctx.strokeStyle = a.filter.active ? theme.selection : theme.gridline
    ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, 18, 19)
    ctx.fillStyle = a.filter.active ? theme.selection : theme.foreground
    ctx.globalAlpha = a.filter.disabled ? 0.4 : 1
    ctx.beginPath(); ctx.moveTo(x + 5, y + 8); ctx.lineTo(x + 14, y + 8)
    ctx.lineTo(x + 9.5, y + 13); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1
  }
  if (a.edges) {
    ctx.strokeStyle = a.reference ? theme.reference : theme.selection
    ctx.lineWidth = 1
    ctx.setLineDash(a.reference ? [4, 3] : [])
    ctx.beginPath()
    if (a.edges & 1) { ctx.moveTo(b.x, b.y + 0.5); ctx.lineTo(b.x + b.width, b.y + 0.5) }
    if (a.edges & 2) {
      ctx.moveTo(b.x + b.width - 0.5, b.y); ctx.lineTo(b.x + b.width - 0.5, b.y + b.height)
    }
    if (a.edges & 4) {
      ctx.moveTo(b.x, b.y + b.height - 0.5); ctx.lineTo(b.x + b.width, b.y + b.height - 0.5)
    }
    if (a.edges & 8) { ctx.moveTo(b.x + 0.5, b.y); ctx.lineTo(b.x + 0.5, b.y + b.height) }
    ctx.stroke(); ctx.setLineDash([])
  }
}
