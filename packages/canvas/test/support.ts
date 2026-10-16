import { createStore, type Store } from '@einfach/core'
import { vi } from 'vitest'

export function canvasFixture() {
  const context = {
    save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(),
    rect: vi.fn(), clip: vi.fn(), clearRect: vi.fn(), fillText: vi.fn(),
  }
  const native = new EventTarget()
  const documentEvents = new EventTarget()
  const capture = new Set<number>()
  const canvas = {
    width: 0, height: 0, style: {}, getContext: () => context,
    addEventListener: native.addEventListener.bind(native),
    removeEventListener: native.removeEventListener.bind(native),
    dispatchEvent: native.dispatchEvent.bind(native),
    setPointerCapture: (id: number) => capture.add(id),
    hasPointerCapture: (id: number) => capture.has(id),
    releasePointerCapture: (id: number) => capture.delete(id),
    getBoundingClientRect: () => ({ left: 0, top: 0,
      width: parseFloat(canvas.style.width), height: parseFloat(canvas.style.height) }),
    ownerDocument: {
      elementFromPoint: () => canvas,
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    },
  } as unknown as HTMLCanvasElement
  return { canvas, context }
}

export function observedStore() {
  const original = createStore()
  let active = 0
  const store: Store = {
    ...original,
    sub(entity, listener) {
      const unsubscribe = original.sub(entity, listener)
      active++
      return () => { active--; unsubscribe() }
    },
  }
  return { store, active: () => active }
}

export function frameFixture() {
  const frames = new Map<number, FrameRequestCallback>()
  let nextId = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback)
    return nextId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  return {
    pending: () => frames.size,
    tick() {
      const current = Array.from(frames)
      frames.clear()
      for (const [, callback] of current) callback(0)
    },
  }
}
