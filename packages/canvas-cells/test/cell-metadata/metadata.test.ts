import { expect, test, vi } from 'vitest'
import { paintCellMetadata } from '../../src/cell-metadata/paint-metadata'

test('canvas paints native index and separate note and thread markers inside one clip', () => {
  const ctx = Object.fromEntries(['save', 'restore', 'beginPath', 'rect', 'clip', 'fillText',
    'moveTo', 'lineTo', 'closePath', 'fill', 'arc'].map((name) => [name, vi.fn()]))
  paintCellMetadata(ctx as unknown as CanvasRenderingContext2D,
    { x: 0, y: 0, width: 120, height: 28 }, {
      row: 0, col: 0, displayValue: '50', noteIndicator: true, commentIndicator: true,
      conditionalIcon: { set: 'three-arrows', index: 1, showValue: false },
    })
  expect(ctx.fillText).toHaveBeenCalledWith('→', 10, 14)
  expect(ctx.moveTo).toHaveBeenCalledWith(113, 1)
  expect(ctx.arc).toHaveBeenCalledWith(109, 4, 2.5, 0, Math.PI * 2)
  expect(ctx.clip).toHaveBeenCalledOnce()
  expect(ctx.restore).toHaveBeenCalledOnce()
})
