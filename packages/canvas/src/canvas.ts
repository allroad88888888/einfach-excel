import type { Store } from '@einfach/core'
import { withInvalidation, withStore } from './atom.js'
import { createRoot, createScope, getOwner, onCleanup, runWithOwner } from './owner.js'
import { paintCells, type FrameStats, type Paint, type PaintCell, type Rect } from './paint.js'
import { withCellEvents } from './events.js'
import { createPointerDispatcher } from './pointer.js'

export interface CanvasOptions {
  readonly store: Store
  readonly width: number
  readonly height: number
  readonly pointerEvents?: boolean
  readonly pixelRatio?: number
  readonly onFrame?: (stats: FrameStats) => void
}

export interface CanvasCell {
  invalidate(): void
  dispose(): void
}

export interface CanvasSurface {
  createCell(bounds: Rect, setup: () => Paint): CanvasCell
  /** Enter the region lifetime to create its shared cached atom factories. */
  run<T>(fn: () => T): T
  resize(width: number, height: number, pixelRatio?: number): void
  invalidate(): void
  flush(): void
  dispose(): void
}

function positive(value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Canvas dimensions must be positive.')
}

export function createCanvas(canvas: HTMLCanvasElement, options: CanvasOptions): CanvasSurface {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('A 2D canvas context is required.')
  positive(options.width)
  positive(options.height)
  let ratio = options.pixelRatio ?? globalThis.devicePixelRatio ?? 1
  positive(ratio)
  return createRoot(dispose => withStore(options.store, () => {
    const owner = getOwner()!
    const cells = new Set<PaintCell>()
    const dirty = new Set<Rect>()
    let viewport: Rect = { x: 0, y: 0, width: options.width, height: options.height }
    const pointer = createPointerDispatcher(canvas, () => viewport, options.pointerEvents !== false)
    onCleanup(pointer.dispose)
    let full = true
    let frame: number | undefined
    function schedule() {
      if (owner.disposed || frame !== undefined) return
      frame = requestAnimationFrame(() => { frame = undefined; flush() })
    }
    function invalidate(rect?: Rect) {
      if (owner.disposed) return
      if (!rect) { full = true; dirty.clear() } else if (!full) dirty.add(rect)
      schedule()
    }
    function flush() {
      if (owner.disposed) return
      if (frame !== undefined) { cancelAnimationFrame(frame); frame = undefined }
      if (!full && !dirty.size) return
      const areas = full ? [viewport] : Array.from(dirty)
      full = false
      dirty.clear()
      const started = performance.now()
      try {
        const count = paintCells(context!, cells, areas, viewport, ratio)
        options.onFrame?.({ cells: count, elapsed: performance.now() - started })
      } catch (error) {
        // A caller may fix its painter and explicitly invalidate/flush again.
        full = true
        throw error
      }
    }
    function resize(width: number, height: number, pixelRatio = ratio) {
      if (owner.disposed) throw new Error('Canvas region has been disposed.')
      positive(width)
      positive(height)
      positive(pixelRatio)
      ratio = pixelRatio
      viewport = { x: 0, y: 0, width, height }
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      invalidate()
    }
    function createCell(bounds: Rect, setup: () => Paint): CanvasCell {
      positive(bounds.width)
      positive(bounds.height)
      if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) {
        throw new Error('Cell coordinates must be finite.')
      }
      const rect = Object.freeze({ ...bounds })
      return runWithOwner(owner, () => withStore(options.store, () => createScope(stop => {
        const cellOwner = getOwner()!
        const target = pointer.add(rect)
        let record: PaintCell | undefined = undefined
        const repaint = () => { if (!cellOwner.disposed) invalidate(rect) }
        onCleanup(() => {
          if (record) cells.delete(record)
          try { pointer.remove(target) } finally { invalidate(rect) }
        })
        const paint = withCellEvents(target, () => withInvalidation(repaint, setup))
        // Cancel capture before handler/subscription cleanup runs in reverse order.
        onCleanup(() => pointer.remove(target))
        if (typeof paint !== 'function') throw new Error('Cell setup must return a painter.')
        if (cellOwner.disposed) throw new Error('Cell was disposed during setup.')
        record = { bounds: rect, paint }
        cells.add(record)
        repaint()
        return { invalidate: repaint, dispose: stop }
      })))
    }
    onCleanup(() => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      frame = undefined
      dirty.clear()
      cells.clear()
      context!.save()
      try {
        context!.setTransform(1, 0, 0, 1, 0, 0)
        context!.clearRect(0, 0, canvas.width, canvas.height)
      } finally { context!.restore() }
    })
    resize(options.width, options.height, ratio)
    return {
      createCell, resize, flush, dispose,
      invalidate: () => invalidate(),
      run: <T>(fn: () => T) => runWithOwner(owner, () => withStore(options.store, fn)),
    }
  }))
}
