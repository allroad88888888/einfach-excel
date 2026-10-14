import type { Rect } from '@einfach/canvas'
import type { DisplayCell } from '@einfach/spreadsheet-ui-core'
import type { CanvasCellsTheme } from './types'

function ellipsis(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text
  if (ctx.measureText('…').width > width) return ''
  const chars = Array.from(text)
  let lo = 0, hi = chars.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (ctx.measureText(chars.slice(0, mid).join('') + '…').width <= width) lo = mid
    else hi = mid - 1
  }
  return chars.slice(0, lo).join('') + '…'
}
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const char of paragraph) {
      if (line && ctx.measureText(line + char).width > width) {
        lines.push(line)
        if (lines.length >= maxLines) return lines
        line = char
      } else line += char
    }
    lines.push(line)
    if (lines.length >= maxLines) break
  }
  return lines
}
/** Text layout stays inside the full cell rectangle, including offscreen merged anchors. */
export function paintText(
  ctx: CanvasRenderingContext2D, bounds: Rect, cell: DisplayCell | undefined,
  text: string, theme: CanvasCellsTheme, filter: boolean) {
  if (!text) return
  const format = cell?.format
  const fontSize = Math.min(512, Math.max(1, format?.fontSize ?? 12))
  const family = format?.fontFamily && /^[A-Za-z0-9, "'\-]+$/.test(format.fontFamily)
    ? format.fontFamily : theme.fontFamily
  const font = (size: number) =>
    `${format?.italic ? 'italic ' : ''}${format?.bold ? 'bold ' : ''}${size}px ${family}`
  const indent = Math.max(0, Math.min(250, format?.indent ?? 0)) * 8
  const width = Math.max(0, bounds.width - 14 - indent - (filter ? 22 : 0))
  const height = Math.max(0, bounds.height - 7)
  if (!width || !height) return
  ctx.save()
  try {
    ctx.beginPath()
    ctx.rect(bounds.x + 7 + indent, bounds.y + 3, width, height)
    ctx.clip()
    ctx.font = font(fontSize)
    ctx.fillStyle = theme.foreground
    if (format?.fgColor) ctx.fillStyle = format.fgColor
    const wrapping = format?.overflow === 'wrap' || format?.wrap
    const vertical = format?.rotation === 'vertical'
    let size = fontSize
    if (format?.shrinkToFit && !wrapping && !vertical) {
      size *= Math.min(1, width / Math.max(1, ctx.measureText(text).width))
      ctx.font = font(size)
    }
    const lineHeight = size * 1.2
    const maxLines = Math.max(1, Math.ceil(height / lineHeight))
    const lines = vertical ? Array.from(text).slice(0, maxLines)
      : wrapping ? wrap(ctx, text, width, maxLines)
        : [format?.overflow === 'ellipsis' || format?.overflow === 'clip'
          ? ellipsis(ctx, text.replace(/\n/g, ' '), width) : text.replace(/\n/g, ' ')]
    const align = format?.align ?? (cell?.valueKind === 'number' ? 'right'
      : cell?.valueKind === 'boolean' || cell?.valueKind === 'error' ? 'center' : 'left')
    const left = bounds.x + 7 + indent
    const x = align === 'right' ? left + width : align === 'center' || vertical ? left + width / 2 : left
    const blockHeight = lines.length * lineHeight
    const y = bounds.y + 3 + (format?.verticalAlign === 'top' ? 0
      : format?.verticalAlign === 'center' ? (height - blockHeight) / 2 : height - blockHeight)
    ctx.textBaseline = 'top'
    ctx.textAlign = align === 'right' ? 'right' : align === 'center' || vertical ? 'center' : 'left'
    if (typeof format?.rotation === 'number' && format.rotation) {
      const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2
      ctx.translate(cx, cy)
      ctx.rotate(Math.max(-90, Math.min(90, format.rotation)) * Math.PI / 180)
      ctx.translate(-cx, -cy)
    }
    lines.forEach((line, index) => {
      const top = y + index * lineHeight
      ctx.fillText(line, x, top)
      if (format?.underline || format?.strikethrough) {
        const measured = ctx.measureText(line).width
        const from = ctx.textAlign === 'right' ? x - measured
          : ctx.textAlign === 'center' ? x - measured / 2 : x
        ctx.strokeStyle = ctx.fillStyle
        ctx.lineWidth = 1
        const decorations = [
          format.underline ? size : null, format.strikethrough ? size * 0.55 : null,
        ]
        for (const offset of decorations) {
          if (offset === null) continue
          ctx.beginPath(); ctx.moveTo(from, top + offset)
          ctx.lineTo(from + measured, top + offset); ctx.stroke()
        }
      }
    })
  } finally { ctx.restore() }
}
