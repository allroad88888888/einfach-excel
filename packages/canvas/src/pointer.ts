import type { CellPointerType, PointerTarget } from './events.js'
import type { Rect } from './paint.js'

/** One native listener set per canvas, with cell-local dispatch and pointer capture. */
export function createPointerDispatcher(canvas: HTMLCanvasElement, viewport: () => Rect) {
  const targets = new Set<PointerTarget>()
  const captured = new Map<number, PointerTarget>()
  const hovered = new Map<number, PointerTarget>()
  const latest = new Map<number, PointerEvent>()
  let disposed = false

  function point(event: PointerEvent) {
    const box = canvas.getBoundingClientRect()
    const view = viewport()
    return {
      x: box.width ? (event.clientX - box.left) * view.width / box.width : -1,
      y: box.height ? (event.clientY - box.top) * view.height / box.height : -1,
    }
  }
  function hit(event: PointerEvent): PointerTarget | undefined {
    const element = canvas.ownerDocument.elementFromPoint(event.clientX, event.clientY)
    if (element !== canvas) return undefined
    const { x, y } = point(event)
    const list = Array.from(targets)
    for (let i = list.length - 1; i >= 0; i--) {
      const target = list[i]
      const bounds = target.bounds
      if (target.active && x >= bounds.x && y >= bounds.y
        && x < bounds.x + bounds.width && y < bounds.y + bounds.height) return target
    }
    return undefined
  }
  function release(id: number) {
    captured.delete(id)
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id)
  }
  function emit(target: PointerTarget | undefined, type: CellPointerType, native: PointerEvent) {
    if (!target) return
    const { x, y } = point(native)
    const event = {
      nativeEvent: native, x, y, localX: x - target.bounds.x, localY: y - target.bounds.y,
      capturePointer() {
        if (!target.active || disposed) return
        canvas.setPointerCapture(native.pointerId)
        captured.set(native.pointerId, target)
      },
      releasePointer() {
        if (captured.get(native.pointerId) === target) release(native.pointerId)
      },
    }
    for (const handler of Array.from(target.handlers.get(type) ?? [])) handler(event)
  }
  function hover(event: PointerEvent, next: PointerTarget | undefined) {
    const previous = hovered.get(event.pointerId)
    if (previous === next) return
    hovered.delete(event.pointerId)
    emit(previous, 'pointerleave', event)
    if (next?.active && !disposed) {
      hovered.set(event.pointerId, next)
      emit(next, 'pointerenter', event)
    }
  }
  function handle(native: Event) {
    const event = native as PointerEvent
    if (disposed) return
    if (event.type === 'lostpointercapture' && !captured.has(event.pointerId)) return
    latest.set(event.pointerId, event)
    const type = event.type
    if (type === 'lostpointercapture' || type === 'pointercancel') {
      const target = captured.get(event.pointerId) ?? hovered.get(event.pointerId)
      try { emit(target, 'pointercancel', event) } finally {
        release(event.pointerId)
        hover(event, undefined)
        latest.delete(event.pointerId)
      }
      return
    }
    if (type === 'pointerleave') {
      hover(event, undefined)
      if (!captured.has(event.pointerId)) latest.delete(event.pointerId)
      return
    }
    const target = hit(event)
    hover(event, target)
    const recipient = captured.get(event.pointerId) ?? (target?.active ? target : undefined)
    if (type === 'pointerup') {
      try { emit(recipient, 'pointerup', event) } finally {
        release(event.pointerId)
        if (event.pointerType === 'touch') {
          hover(event, undefined)
          latest.delete(event.pointerId)
        }
      }
    } else if (type === 'pointerdown' || type === 'pointermove') emit(recipient, type, event)
  }
  function refreshHover() {
    for (const event of latest.values()) hover(event, hit(event))
  }
  const types = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'pointerleave', 'lostpointercapture']
  for (const type of types) canvas.addEventListener(type, handle)
  canvas.ownerDocument.addEventListener('scroll', refreshHover, true)

  function remove(target: PointerTarget) {
    if (!target.active) return
    target.active = false
    targets.delete(target)
    const errors: unknown[] = []
    for (const [id, item] of captured) {
      if (item !== target) continue
      release(id)
      const event = latest.get(id)
      try { if (event) emit(target, 'pointercancel', event) } catch (error) { errors.push(error) }
    }
    for (const [id, item] of hovered) {
      if (item !== target) continue
      hovered.delete(id)
      const event = latest.get(id)
      try { if (event) emit(target, 'pointerleave', event) } catch (error) { errors.push(error) }
    }
    target.handlers.clear()
    if (errors.length) throw new AggregateError(errors, 'Cell pointer cleanup failed.')
  }
  return {
    add(bounds: Rect): PointerTarget {
      const target = { bounds, active: true, handlers: new Map() }
      targets.add(target)
      return target
    },
    remove,
    dispose() {
      disposed = true
      for (const type of types) canvas.removeEventListener(type, handle)
      canvas.ownerDocument.removeEventListener('scroll', refreshHover, true)
      for (const id of captured.keys()) release(id)
      targets.clear()
      hovered.clear()
      latest.clear()
    },
  }
}
