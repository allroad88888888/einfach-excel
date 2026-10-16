import type { Rect } from './paint.js'

/** Copy only the overlap at exact device-pixel offsets; return the newly exposed world strips. */
export function scrollPixels(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  previous: Rect, next: Rect, ratio: number): { exposed: Rect[]; pixels: number } | undefined {
  const dx = (previous.x - next.x) * ratio, dy = (previous.y - next.y) * ratio
  if (previous.width !== next.width || previous.height !== next.height
    || ![dx, dy, next.width * ratio, next.height * ratio].every(Number.isInteger)) return undefined
  const left = Math.max(previous.x, next.x), top = Math.max(previous.y, next.y)
  const right = Math.min(previous.x + previous.width, next.x + next.width)
  const bottom = Math.min(previous.y + previous.height, next.y + next.height)
  if (right <= left || bottom <= top) return undefined
  const width = (right - left) * ratio, height = (bottom - top) * ratio
  context.save()
  try {
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.beginPath()
    context.rect((left - next.x) * ratio, (top - next.y) * ratio, width, height)
    context.clip()
    // Copy replaces transparent pixels too; the clip protects pixels outside the overlap.
    context.globalCompositeOperation = 'copy'
    context.imageSmoothingEnabled = false
    context.drawImage(canvas,
      (left - previous.x) * ratio, (top - previous.y) * ratio, width, height,
      (left - next.x) * ratio, (top - next.y) * ratio, width, height)
  } finally { context.restore() }
  const exposed: Rect[] = []
  if (top > next.y) exposed.push({ x: next.x, y: next.y, width: next.width, height: top - next.y })
  if (bottom < next.y + next.height) exposed.push({ x: next.x, y: bottom,
    width: next.width, height: next.y + next.height - bottom })
  if (left > next.x) exposed.push({ x: next.x, y: top, width: left - next.x, height: bottom - top })
  if (right < next.x + next.width) exposed.push({ x: right, y: top,
    width: next.x + next.width - right, height: bottom - top })
  return { exposed, pixels: width * height }
}
