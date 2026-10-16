import { assertOwner, createContext, onCleanup, provideContext, useContext } from './owner.js'
import type { Rect } from './paint.js'

export interface CellPointerEvent {
  readonly nativeEvent: PointerEvent
  readonly x: number
  readonly y: number
  readonly localX: number
  readonly localY: number
  capturePointer(): void
  releasePointer(): void
}

export type CellPointerHandler = (event: CellPointerEvent) => void
export type CellPointerType = 'pointerdown' | 'pointermove' | 'pointerup'
  | 'pointercancel' | 'pointerenter' | 'pointerleave'

export interface PointerTarget {
  bounds: Rect
  readonly handlers: Map<CellPointerType, Set<CellPointerHandler>>
  active: boolean
}

const cellContext = createContext<PointerTarget | undefined>(undefined)

export function withCellEvents<T>(target: PointerTarget, fn: () => T): T {
  return provideContext(cellContext, target, fn)
}

function register(type: CellPointerType, handler: CellPointerHandler): () => void {
  assertOwner()
  const target = useContext(cellContext)
  if (!target?.active) throw new Error('Pointer handlers require a live canvas cell setup.')
  let handlers = target.handlers.get(type)
  if (!handlers) target.handlers.set(type, handlers = new Set())
  handlers.add(handler)
  const stop = () => { handlers.delete(handler) }
  // The target's cleanup runs before these callbacks, allowing a final cancel event.
  onCleanup(stop)
  return stop
}

export const onPointerDown = (handler: CellPointerHandler) => register('pointerdown', handler)
export const onPointerMove = (handler: CellPointerHandler) => register('pointermove', handler)
export const onPointerUp = (handler: CellPointerHandler) => register('pointerup', handler)
export const onPointerCancel = (handler: CellPointerHandler) => register('pointercancel', handler)
export const onPointerEnter = (handler: CellPointerHandler) => register('pointerenter', handler)
export const onPointerLeave = (handler: CellPointerHandler) => register('pointerleave', handler)
