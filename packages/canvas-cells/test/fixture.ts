import { createStore, type Store } from '@einfach/core'
import { vi } from 'vitest'

export function fixture() {
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0, subscriptions = 0, created = 0, released = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback); return id
  })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
  const context = {
    save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(),
    setTransform: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
    rect: vi.fn(), clip: vi.fn(), clearRect: vi.fn(), fillText: vi.fn(), fillRect: vi.fn(),
    strokeRect: vi.fn(), setLineDash: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    fill: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 7 }),
  }
  const native = new EventTarget(), documentEvents = new EventTarget()
  const canvas = {
    width: 0, height: 0, style: {}, dataset: {}, getContext: () => context,
    addEventListener: native.addEventListener.bind(native),
    removeEventListener: native.removeEventListener.bind(native),
    dispatchEvent: native.dispatchEvent.bind(native),
    hasPointerCapture: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0,
      width: parseFloat(canvas.style.width), height: parseFloat(canvas.style.height) }),
    ownerDocument: {
      elementFromPoint: () => canvas,
      addEventListener: documentEvents.addEventListener.bind(documentEvents),
      removeEventListener: documentEvents.removeEventListener.bind(documentEvents),
    },
  } as unknown as HTMLCanvasElement
  const original = createStore()
  const store: Store = { ...original, sub(entity, listener) {
    const stop = original.sub(entity, listener); subscriptions++; created++
    return () => { subscriptions--; released++; stop() }
  } }
  return { canvas, context, store, created: () => created, released: () => released,
    subscriptions: () => subscriptions, pending: () => frames.size,
    move(x: number, y: number) {
      documentEvents.dispatchEvent(Object.assign(new Event('pointermove'), {
        clientX: x, clientY: y, isPrimary: true, pointerType: 'mouse', pointerId: 1,
      }))
    },
  }
}
