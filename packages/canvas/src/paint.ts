export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type Paint = (context: CanvasRenderingContext2D, bounds: Rect) => void

export interface FrameStats {
  readonly cells: number
  readonly reusedPixels?: number
  readonly elapsed: number
}

export interface PaintCell {
  bounds: Rect
  readonly paint: Paint
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Repaint the dirty union in insertion order, including overlapping cells. */
export function paintCells(
  context: CanvasRenderingContext2D,
  cells: ReadonlySet<PaintCell>,
  dirty: readonly Rect[],
  viewport: Rect,
  ratio: number,
  background?: string,
): number {
  let painted = 0
  context.save()
  try {
    context.setTransform(ratio, 0, 0, ratio, (0 - viewport.x) * ratio, (0 - viewport.y) * ratio)
    context.beginPath()
    for (const rect of dirty) context.rect(rect.x, rect.y, rect.width, rect.height)
    context.clip()
    context.clearRect(viewport.x, viewport.y, viewport.width, viewport.height)
    if (background) {
      context.fillStyle = background
      context.fillRect(viewport.x, viewport.y, viewport.width, viewport.height)
    }
    for (const cell of cells) {
      const affected = dirty.some(rect => intersects(rect, cell.bounds))
      if (!intersects(cell.bounds, viewport) || !affected) {
        continue
      }
      context.save()
      try {
        const { x, y, width, height } = cell.bounds
        context.beginPath()
        context.rect(x, y, width, height)
        context.clip()
        cell.paint(context, cell.bounds)
        painted++
      } finally {
        context.restore()
      }
    }
  } finally {
    context.restore()
  }
  return painted
}
