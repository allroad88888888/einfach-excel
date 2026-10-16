import { afterEach, expect, test, vi } from 'vitest'
import { createCanvasCells } from '../src/index'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())

test('a small bitmap crops a large projection without losing hit coordinates or subscriptions', () => {
  const f = fixture(), frame = vi.fn()
  const renderer = createCanvasCells(f.canvas, {
    window: { rowStart: 0, rowEnd: 99, colStart: 0, colEnd: 19 }, cells: [],
  }, { store: f.store, pixelRatio: 2, onFrame: frame,
    viewport: { x: 0, y: 0, width: 240, height: 56 } })
  renderer.flush()
  expect([f.canvas.width, f.canvas.height]).toEqual([480, 112])
  expect(frame.mock.lastCall?.[0].cells).toBe(4)
  const subscriptions = f.subscriptions()
  renderer.setViewport({ x: 120, y: 280, width: 240, height: 56 })
  renderer.flush()
  expect(renderer.hitTest(10, 10)).toEqual({ row: 10, col: 1 })
  expect(f.context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, -240, -560)
  expect(frame.mock.lastCall?.[0].cells).toBe(4)
  expect(f.subscriptions()).toBe(subscriptions)
  expect([f.canvas.width, f.canvas.height]).toEqual([480, 112])
  renderer.dispose()
  expect(f.subscriptions()).toBe(0)
})

test('clips a giant merge while retaining its real bounds and offscreen anchor', () => {
  const f = fixture()
  const renderer = createCanvasCells(f.canvas, {
    window: { rowStart: 400, rowEnd: 500, colStart: 0, colEnd: 1 }, cells: [],
    mergedRanges: [{ rowStart: 0, rowEnd: 999, colStart: 0, colEnd: 0 }],
    mergeAnchors: [{ row: 0, col: 0, displayValue: 'Tall', mergedSpan: { rows: 1000, cols: 1 } }],
  }, { store: f.store, viewport: { x: 0, y: 100, width: 120, height: 100 } })
  renderer.flush()
  expect(f.canvas.height).toBe(100)
  expect(renderer.hitTest(10, 10)).toEqual({ row: 0, col: 0 })
  expect(f.context.rect).toHaveBeenCalledWith(0, 0, 120, 28000)
  renderer.dispose()
})
