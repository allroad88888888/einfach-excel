import { paintCell } from './paint-cell'
import type { CanvasCellPaintHooks, CanvasCellsTheme, CellPaintModel } from './types'

/** A host painter is clipped to its cell and cannot leak canvas state into neighboring cells. */
export function paintCellWithHooks(
  ctx: CanvasRenderingContext2D,
  model: CellPaintModel,
  theme: CanvasCellsTheme,
  hooks?: CanvasCellPaintHooks,
): void {
  if (!hooks) {
    paintCell(ctx, model, theme)
    return
  }
  const { item } = model
  const input = Object.freeze({
    context: ctx,
    cell: item.cell,
    bounds: Object.freeze({ ...item.bounds }),
    range: Object.freeze({ ...item.range }),
    merged: item.merged,
  })
  const run = (callback: CanvasCellPaintHooks['before']): boolean | void => {
    if (!callback) return
    ctx.save()
    try {
      const b = item.bounds
      ctx.beginPath()
      ctx.rect(b.x, b.y, b.width, b.height)
      ctx.clip()
      return callback(input)
    } catch (error) {
      try {
        hooks.onError?.(error)
      } catch {
        /* A host diagnostic must not interrupt other cells. */
      }
    } finally {
      ctx.restore()
    }
  }
  if (run(hooks.before) !== false) paintCell(ctx, model, theme)
  run(hooks.after)
}
