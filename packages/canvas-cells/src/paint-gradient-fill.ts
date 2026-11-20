import { linearGradientVector, sortedGradientStops,
  type SpreadsheetGradientFill } from '@einfach-excel/spreadsheet-ui-core'
import type { Rect } from '@einfach-excel/canvas'
import { paintPathGradient } from './paint-path-gradient'

/** Linear gradients use the physical box projection; path gradients use their distance field. */
export function paintGradientFill(ctx: CanvasRenderingContext2D,
  bounds: Rect, fill: SpreadsheetGradientFill) {
  if (!fill.stops.length) return
  if (fill.kind === 'path-gradient') { paintPathGradient(ctx, bounds, fill); return }
  const stops = sortedGradientStops(fill.stops)
  const { x, y, width, height } = bounds
  const { from, to } = linearGradientVector(fill.degree, width, height)
  const paint = ctx.createLinearGradient(x + from[0], y + from[1], x + to[0], y + to[1])
  for (const stop of stops) paint.addColorStop(stop.position, stop.color)
  ctx.fillStyle = paint
  ctx.fillRect(x, y, width, height)
}
