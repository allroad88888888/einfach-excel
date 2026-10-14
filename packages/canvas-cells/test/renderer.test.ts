import { afterEach, expect, test, vi } from 'vitest'
import { selectCellAtom } from '@einfach/spreadsheet-ui-core'
import { createCanvasCells, canvasCellAt } from '../src/index'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())
const input = { window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 2 },
  cells: [{ row: 0, col: 0, displayValue: 'First' }] }

test('reconciles changed values without recreating subscriptions; coalesces a frame', () => {
  const f = fixture(), frame = vi.fn()
  const renderer = createCanvasCells(f.canvas, input, { store: f.store, onFrame: frame })
  renderer.flush()
  expect(frame.mock.lastCall?.[0].cells).toBe(6)
  const subscriptions = f.subscriptions()
  for (let n = 0; n < 100; n++) renderer.update({ ...input,
    cells: [{ row: 0, col: 0, displayValue: String(n) }] })
  expect(f.pending()).toBe(1)
  renderer.flush()
  expect(frame.mock.lastCall?.[0].cells).toBe(1)
  expect(f.context.fillText).toHaveBeenCalledWith('99', expect.any(Number), expect.any(Number))
  expect(f.subscriptions()).toBe(subscriptions)
  renderer.dispose()
  expect(f.subscriptions()).toBe(0)
  expect(f.pending()).toBe(0)
  expect(canvasCellAt(f.canvas, 10, 10)).toBeNull()
  expect(() => renderer.update(input)).toThrow('disposed')
})

test('hover updates two cells and selection subscribes to the existing UI Core atoms', () => {
  const f = fixture(), frame = vi.fn()
  const renderer = createCanvasCells(f.canvas, input, { store: f.store, onFrame: frame })
  renderer.flush()
  f.move(10, 10); renderer.flush()
  expect(frame.mock.lastCall?.[0].cells).toBe(1)
  f.move(130, 10); renderer.flush()
  expect(frame.mock.lastCall?.[0].cells).toBe(2)
  f.store.setter(selectCellAtom, { coord: { row: 1, col: 2 } })
  expect(f.pending()).toBe(1)
  renderer.flush()
  expect(frame.mock.lastCall?.[0].cells).toBe(2)
  renderer.dispose()
})

test('geometry changes, retained input and disposal update the hit registry', () => {
  const f = fixture()
  const renderer = createCanvasCells(f.canvas, input, { store: f.store })
  expect(canvasCellAt(f.canvas, 130, 10)).toEqual({ row: 0, col: 1 })
  renderer.update({ ...input, columnWidths: [0, 60, 60] })
  expect(canvasCellAt(f.canvas, 10, 10)).toEqual({ row: 0, col: 1 })
  expect(f.canvas.dataset.cellCount).toBe('4')
  renderer.update({ ...input, interactive: false })
  expect(canvasCellAt(f.canvas, 10, 10)).toBeNull()
  renderer.dispose(); renderer.dispose()
  f.move(10, 10)
  expect(f.pending()).toBe(0)
})

test('merged anchors remain hit-testable after clipping and invisible windows paint nothing', () => {
  const f = fixture(), frame = vi.fn()
  const merged = { window: { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 }, cells: [],
    mergedRanges: [{ rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 }],
    mergeAnchors: [{ row: 0, col: 0, displayValue: 'Full merge', mergedSpan: { rows: 2, cols: 2 } }] }
  const renderer = createCanvasCells(f.canvas, merged, { store: f.store, onFrame: frame })
  renderer.flush()
  expect(renderer.hitTest(10, 10)).toEqual({ row: 0, col: 0 })
  expect(f.context.fillText).toHaveBeenCalledWith('Full merge', expect.any(Number), expect.any(Number))
  renderer.update({ ...input, rowHeights: [0, 0], columnWidths: [0, 0, 0] })
  renderer.flush()
  expect(f.canvas.style.width).toBe('0px')
  expect(frame.mock.lastCall?.[0].cells).toBe(0)
  renderer.dispose()
})
