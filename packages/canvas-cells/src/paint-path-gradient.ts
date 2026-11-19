import { gradientColorAt, sortedGradientStops,
  type SpreadsheetPathGradientFill } from '@einfach-excel/spreadsheet-ui-core'
import type { Rect } from '@einfach-excel/canvas'

/**
 * For a fixed device row, max(dl,dr,dt,db) is two horizontal ramps plus a constant
 * middle. One gradient spans that whole row, so there are no antialiased polygon seams.
 * Grid and PNG painters both use positive axis-aligned transforms. Work is bounded by
 * destination canvas rows, even when a merged logical box extends far beyond the viewport.
 */
export function paintPathGradient(ctx: CanvasRenderingContext2D,
  bounds: Rect, fill: SpreadsheetPathGradientFill) {
  const stops = sortedGradientStops(fill.stops)
  if (!stops.length) return
  const { x, y, width, height } = bounds
  if (stops.every(stop => stop.color === stops[0].color)) {
    ctx.fillStyle = stops[0].color; ctx.fillRect(x, y, width, height); return
  }
  const left = Math.min(fill.left, fill.right), right = Math.max(fill.left, fill.right)
  const top = Math.min(fill.top, fill.bottom), bottom = Math.max(fill.top, fill.bottom)
  const transform = ctx.getTransform(), scale = transform.d, offset = transform.f
  if (!(scale > 0)) return
  const clampStop = (position: number) => Math.max(0, Math.min(1, position))
  const firstRow = Math.max(0, Math.floor(y * scale + offset))
  const lastRow = Math.min(ctx.canvas.height, Math.ceil((y + height) * scale + offset))
  const reverseStops = [...stops].reverse()
  const outer = stops[stops.length - 1].color
  let previousDistance = -1
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip()
  for (let row = firstRow; row < lastRow; row++) {
    const v = Math.max(0, Math.min(1, ((row + 0.5 - offset) / scale - y) / height))
    const distance = Math.max(0, top ? (top - v) / top : 0,
      bottom < 1 ? (v - bottom) / (1 - bottom) : 0)
    if (distance !== previousDistance) {
      const paint = ctx.createLinearGradient(x, 0, x + width, 0)
      const middle = gradientColorAt(stops, distance)
      paint.addColorStop(0, left > 0 ? outer : middle)
      if (left > 0) for (const stop of reverseStops) {
        if (stop.position > distance)
          paint.addColorStop(clampStop(left * (1 - stop.position)), stop.color)
      }
      paint.addColorStop(clampStop(left * (1 - distance)), middle)
      paint.addColorStop(clampStop(right + (1 - right) * distance), middle)
      if (right < 1) for (const stop of stops) {
        if (stop.position > distance)
          paint.addColorStop(clampStop(right + (1 - right) * stop.position), stop.color)
      }
      paint.addColorStop(1, right < 1 ? outer : middle)
      ctx.fillStyle = paint
      previousDistance = distance
    }
    ctx.fillRect(x, (row - offset) / scale, width, 1 / scale)
  }
  ctx.restore()
}
