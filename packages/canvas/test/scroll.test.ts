import { afterEach, expect, test, vi } from 'vitest'
import { createCanvas } from '../src/canvas'
import { canvasFixture, frameFixture, observedStore } from './support'

afterEach(() => vi.unstubAllGlobals())

test('copies the overlap and repaints exposed cells plus pending content damage', () => {
  frameFixture()
  const f = canvasFixture(), store = observedStore().store, frame = vi.fn()
  const surface = createCanvas(f.canvas, { store, width: 100, height: 60,
    reusePixels: true, onFrame: frame })
  const cells = Array.from({ length: 8 }, (_, row) => surface.createCell({
    x: 0, y: row * 20, width: 100, height: 20,
  }, () => () => {}))
  surface.flush()
  expect(frame.mock.lastCall?.[0].cells).toBe(3)
  surface.setViewport({ x: 0, y: 20, width: 100, height: 60 })
  surface.flush()
  expect(frame.mock.lastCall?.[0]).toMatchObject({ cells: 1, reusedPixels: 4000 })
  expect(f.context.drawImage).toHaveBeenCalledOnce()
  cells[2]!.invalidate()
  surface.setViewport({ x: 0, y: 40, width: 100, height: 60 })
  surface.flush()
  expect(frame.mock.lastCall?.[0]).toMatchObject({ cells: 2, reusedPixels: 4000 })
  surface.dispose()
})

test('coalesces scrolls from the last painted frame and falls back for jumps or fractional pixels', () => {
  frameFixture()
  const f = canvasFixture(), frame = vi.fn()
  const surface = createCanvas(f.canvas, { store: observedStore().store,
    width: 100, height: 60, reusePixels: true, onFrame: frame })
  surface.flush()
  surface.setViewport({ x: 0, y: 10, width: 100, height: 60 })
  surface.setViewport({ x: 0, y: 20, width: 100, height: 60 })
  surface.flush()
  expect(f.context.drawImage).toHaveBeenLastCalledWith(f.canvas, 0, 20, 100, 40, 0, 0, 100, 40)
  for (const y of [1000, 1000.5]) {
    surface.setViewport({ x: 0, y, width: 100, height: 60 })
    surface.flush()
    expect(frame.mock.lastCall?.[0].reusedPixels).toBe(0)
  }
  expect(f.context.drawImage).toHaveBeenCalledOnce()
  surface.dispose()
})
