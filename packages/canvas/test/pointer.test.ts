import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createStore } from '@einfach/core'
import {
  createCanvas, onPointerDown, onPointerMove, onPointerUp,
  onPointerEnter, onPointerLeave, onPointerCancel,
} from '../src/index.js'
import { canvasFixture, frameFixture } from './support.js'

beforeEach(() => frameFixture())
afterEach(() => vi.unstubAllGlobals())

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number) {
  canvas.dispatchEvent(Object.assign(new Event(type), {
    clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true,
  }))
}
function fixture() {
  const { canvas } = canvasFixture()
  const surface = createCanvas(canvas, { store: createStore(), width: 200, height: 100 })
  return { canvas, surface }
}
const bounds = { x: 0, y: 0, width: 100, height: 100 }

test('hits the top painted cell and converts CSS coordinates to local logical pixels', () => {
  const { canvas, surface } = fixture()
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    left: 10, top: 20, width: 400, height: 200,
  } as DOMRect)
  const lower = vi.fn(), upper = vi.fn()
  surface.createCell(bounds, () => { onPointerDown(lower); return () => {} })
  surface.createCell({ ...bounds, x: 20 }, () => { onPointerDown(upper); return () => {} })
  pointer(canvas, 'pointerdown', 70, 60)
  expect(lower).not.toHaveBeenCalled()
  expect(upper).toHaveBeenCalledWith(expect.objectContaining({
    x: 30, y: 20, localX: 10, localY: 20,
  }))
  surface.dispose()
})

test('hover transitions independently of capture; up releases capture without losing hover', () => {
  const { canvas, surface } = fixture()
  const events: string[] = []
  surface.createCell(bounds, () => {
    onPointerEnter(() => events.push('enter a'))
    onPointerLeave(() => events.push('leave a'))
    onPointerDown(e => e.capturePointer())
    onPointerMove(() => events.push('move a'))
    onPointerUp(() => events.push('up a'))
    return () => {}
  })
  surface.createCell({ ...bounds, x: 100 }, () => {
    onPointerEnter(() => events.push('enter b'))
    onPointerLeave(() => events.push('leave b'))
    onPointerMove(() => events.push('move b'))
    return () => {}
  })
  pointer(canvas, 'pointerdown', 10, 10)
  expect(canvas.hasPointerCapture(1)).toBe(true)
  pointer(canvas, 'pointermove', 110, 10)
  pointer(canvas, 'pointerup', 110, 10)
  expect(canvas.hasPointerCapture(1)).toBe(false)
  pointer(canvas, 'lostpointercapture', 110, 10)
  pointer(canvas, 'pointermove', 120, 10)
  expect(events).toEqual(['enter a', 'leave a', 'enter b', 'move a', 'up a', 'move b'])
  surface.dispose()
})

test.each(['pointercancel', 'lostpointercapture'])('%s cancels dragging and clears hover', type => {
  const { canvas, surface } = fixture()
  const cancel = vi.fn(), leave = vi.fn()
  surface.createCell(bounds, () => {
    onPointerDown(e => e.capturePointer())
    onPointerCancel(cancel)
    onPointerLeave(leave)
    return () => {}
  })
  pointer(canvas, 'pointerdown', 10, 10)
  pointer(canvas, type, 10, 10)
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(leave).toHaveBeenCalledTimes(1)
  expect(canvas.hasPointerCapture(1)).toBe(false)
  surface.dispose()
  expect(cancel).toHaveBeenCalledTimes(1)
})

test('disposing a captured cell delivers cancellation before removing its handlers', () => {
  const { canvas, surface } = fixture()
  const cancel = vi.fn(), leave = vi.fn(), move = vi.fn()
  const cell = surface.createCell(bounds, () => {
    onPointerDown(e => e.capturePointer())
    onPointerCancel(cancel)
    onPointerLeave(leave)
    onPointerMove(move)
    return () => {}
  })
  pointer(canvas, 'pointerdown', 10, 10)
  cell.dispose()
  expect(cancel).toHaveBeenCalledTimes(1)
  expect(leave).toHaveBeenCalledTimes(1)
  expect(canvas.hasPointerCapture(1)).toBe(false)
  pointer(canvas, 'pointermove', 10, 10)
  surface.dispose()
  pointer(canvas, 'pointerdown', 10, 10)
  expect(move).not.toHaveBeenCalled()
  expect(cancel).toHaveBeenCalledTimes(1)
})

test('capture delivers events outside the canvas while clipped cells receive no hover', () => {
  const { canvas, surface } = fixture()
  const move = vi.fn(), leave = vi.fn()
  surface.createCell(bounds, () => {
    onPointerDown(e => e.capturePointer())
    onPointerMove(move)
    onPointerLeave(leave)
    return () => {}
  })
  pointer(canvas, 'pointerdown', 10, 10)
  vi.spyOn(canvas.ownerDocument, 'elementFromPoint').mockReturnValue(null)
  pointer(canvas, 'pointermove', 300, 200)
  expect(move).toHaveBeenCalledWith(expect.objectContaining({ x: 300, y: 200 }))
  expect(leave).toHaveBeenCalledTimes(1)
  pointer(canvas, 'pointerup', 300, 200)
  expect(canvas.hasPointerCapture(1)).toBe(false)
  surface.dispose()
})

test('a custom grid hit-test can disable the per-cell pointer dispatcher', () => {
  const { canvas } = canvasFixture()
  const surface = createCanvas(canvas, {
    store: createStore(), width: 200, height: 100, pointerEvents: false,
  })
  const down = vi.fn()
  surface.createCell(bounds, () => { onPointerDown(down); return () => {} })
  pointer(canvas, 'pointerdown', 10, 10)
  expect(down).not.toHaveBeenCalled()
  surface.dispose()
})
