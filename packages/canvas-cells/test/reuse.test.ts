import { afterEach, expect, test, vi } from 'vitest'
import { createCanvasCells } from '../src/index'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())
const input = { window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 2 }, cells: [],
  rowHeights: [28, 28], columnWidths: [120, 120, 120] }

test('crossing a projection boundary only subscribes entering cells and releases exiting cells', () => {
  const f = fixture()
  const renderer = createCanvasCells(f.canvas, input, { store: f.store })
  renderer.flush()
  const created = f.created(), released = f.released()
  renderer.update({ ...input, window: { ...input.window, rowStart: 1, rowEnd: 2 } })
  renderer.flush()
  expect(f.created() - created).toBe(3)
  expect(f.released() - released).toBe(3)
  expect(renderer.hitTest(10, 10)).toEqual({ row: 1, col: 0 })
  renderer.dispose()
  expect(f.created()).toBe(f.released())
})

test('fresh host props and pixel scroll reuse the layout; geometry changes keep cell owners', () => {
  const f = fixture()
  const renderer = createCanvasCells(f.canvas, input, { store: f.store,
    viewport: { x: 0, y: 0, width: 120, height: 28 } })
  renderer.flush()
  const created = f.created()
  for (let n = 0; n < 100; n++) {
    renderer.update({ ...input, window: { ...input.window },
      rowHeights: [...input.rowHeights], columnWidths: [...input.columnWidths] })
    renderer.setViewport({ x: n, y: 0, width: 120, height: 28 })
  }
  expect(f.canvas.dataset.layoutBuilds).toBe('1')
  expect(f.created()).toBe(created)
  renderer.update({ ...input, columnWidths: [140, 120, 120] })
  expect(f.canvas.dataset.layoutBuilds).toBe('2')
  expect(f.created()).toBe(created)
  renderer.dispose()
  expect(f.subscriptions()).toBe(0)
})
