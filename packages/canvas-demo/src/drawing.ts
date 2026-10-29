import type { Rect } from '@einfach-excel/canvas'
import type { GridAppearance } from './grid-selection'

export function drawCard(
  ctx: CanvasRenderingContext2D, rect: Rect, label: string, value: string,
  color = '#315cda', fontSize = 58,
): void {
  ctx.fillStyle = '#f3f6fc'
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.fillStyle = '#78859b'
  ctx.font = '12px -apple-system, sans-serif'
  ctx.textBaseline = 'top'
  ctx.fillText(label, rect.x + 22, rect.y + 18)
  ctx.fillStyle = color
  ctx.font = `500 ${fontSize}px -apple-system, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(value, rect.x + 22, rect.y + rect.height * .62, rect.width - 44)
}

export function drawGridCell(
  ctx: CanvasRenderingContext2D, rect: Rect, value: number, index: number,
  appearance: GridAppearance,
) {
  ctx.fillStyle = value === index % 100 ? '#ffffff' : '#eaf0ff'
  if (appearance.selected) ctx.fillStyle = appearance.active ? '#ffffff' : '#dce8ff'
  if (appearance.hovered) ctx.fillStyle = appearance.selected ? '#c4d8ff' : '#e3f2eb'
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.strokeStyle = '#e2e8f1'
  ctx.lineWidth = 1
  ctx.strokeRect(rect.x + .5, rect.y + .5, rect.width - 1, rect.height - 1)
  ctx.fillStyle = value === index % 100 ? '#52617b' : '#315cda'
  ctx.font = '12px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(value), rect.x + rect.width / 2, rect.y + rect.height / 2)
  if (appearance.active) {
    ctx.strokeStyle = '#7c9de8'
    ctx.strokeRect(rect.x + 2.5, rect.y + 2.5, rect.width - 5, rect.height - 5)
  }
  ctx.strokeStyle = '#315cda'
  ctx.lineWidth = 2
  ctx.beginPath()
  const left = rect.x + 1, right = rect.x + rect.width - 1
  const top = rect.y + 1, bottom = rect.y + rect.height - 1
  if (appearance.edges & 1) { ctx.moveTo(left, top); ctx.lineTo(right, top) }
  if (appearance.edges & 2) { ctx.moveTo(right, top); ctx.lineTo(right, bottom) }
  if (appearance.edges & 4) { ctx.moveTo(left, bottom); ctx.lineTo(right, bottom) }
  if (appearance.edges & 8) { ctx.moveTo(left, top); ctx.lineTo(left, bottom) }
  ctx.stroke()
}
