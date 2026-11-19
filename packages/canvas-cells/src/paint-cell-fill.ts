import { CELL_PATTERN_TILE_SIZE, patternFillRectangles, snapshotCellFill,
  type SpreadsheetCellFormat } from '@einfach-excel/spreadsheet-ui-core'
import type { Rect } from '@einfach-excel/canvas'
import { paintGradientFill } from './paint-gradient-fill'

/** A browser pattern resource cache, bounded per Canvas context and released with that context. */
const resources = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>()
const MAX_PATTERNS = 64

export function paintCellFill(
  ctx: CanvasRenderingContext2D, bounds: Rect,
  format: SpreadsheetCellFormat | undefined, fallback: string,
) {
  const { x, y, width, height } = bounds
  if (width <= 0 || height <= 0) return
  const fill = snapshotCellFill(format?.fill)
  ctx.fillStyle = format?.bgColor || (fill && fill.kind !== 'pattern' && !fill.stops.length ? '#000000' : fallback)
  ctx.fillRect(x, y, width, height)
  if (!fill) return
  if (fill.kind !== 'pattern') { paintGradientFill(ctx, bounds, fill); return }
  let cache = resources.get(ctx)
  if (!cache) { cache = new Map(); resources.set(ctx, cache) }
  const key = `${fill.pattern}:${fill.foreground.toLowerCase()}`
  let pattern = cache.get(key)
  if (!pattern) {
    const size = CELL_PATTERN_TILE_SIZE
    const tile = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size)
      : ctx.canvas.ownerDocument.createElement('canvas')
    tile.width = size; tile.height = size
    const paint = tile.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!paint) return
    paint.fillStyle = fill.foreground
    for (const rectangle of patternFillRectangles(fill.pattern)) paint.fillRect(...rectangle)
    pattern = ctx.createPattern(tile, 'repeat') ?? undefined
    if (!pattern) return
    if (cache.size >= MAX_PATTERNS) cache.delete(cache.keys().next().value!)
  }
  cache.delete(key); cache.set(key, pattern)
  ctx.save()
  // The logical 8px tile is a pixel pattern, not a photograph. Keep its two colors at 2x/DPR scaling.
  ctx.imageSmoothingEnabled = false
  ctx.translate(x, y)
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}
