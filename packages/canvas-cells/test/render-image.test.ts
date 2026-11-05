import { afterEach, expect, test, vi } from 'vitest'
import { renderCellsImage } from '../src/render-image'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())

function setup() {
  const { canvas, context } = fixture()
  Object.assign(context, { scale: vi.fn() })
  return { canvas, context: context as typeof context & { scale: ReturnType<typeof vi.fn> } }
}
const window = { rowStart: 4, rowEnd: 5, colStart: 2, colEnd: 3 }
const cells = [{ row: 4, col: 2, displayValue: 'North' }, { row: 5, col: 3, displayValue: '42' }]

test('sizes the bitmap from the given sizes and scale and paints every cell once', () => {
  const { canvas, context } = setup()
  renderCellsImage(canvas, { window, cells, rowHeights: [20, 30], columnWidths: [100, 50] },
    { scale: 2 })
  expect([canvas.width, canvas.height]).toEqual([300, 100])
  expect(context.scale).toHaveBeenCalledWith(2, 2)
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 300, 100)
  expect(context.fillText.mock.calls.map(([text]) => text)).toEqual(
    expect.arrayContaining(['North', '42']))
})

test('falls back to default row and column sizes and honours a theme override', () => {
  const { canvas, context } = setup()
  const fills: unknown[] = []
  const read = context as { fillStyle?: unknown }
  context.fillRect.mockImplementation(() => fills.push(read.fillStyle))
  renderCellsImage(canvas, { window, cells }, { theme: { background: '#102030' } })
  expect([canvas.width, canvas.height]).toEqual([240, 56])
  expect(fills[0]).toBe('#102030')
})

test('rejects bad scales, oversized ranges, invalid sizes and empty images before drawing', () => {
  const { canvas, context } = setup()
  expect(() => renderCellsImage(canvas, { window, cells }, { scale: 5 })).toThrow(/scale/)
  expect(() => renderCellsImage(canvas, {
    window: { rowStart: 0, rowEnd: 65_536, colStart: 0, colEnd: 0 }, cells: [],
  })).toThrow(/65,536/)
  expect(() => renderCellsImage(canvas, { window, cells, rowHeights: [20, Number.NaN] }))
    .toThrow(/size/)
  expect(() => renderCellsImage(canvas, { window, cells, rowHeights: [0, 0] }))
    .toThrow(/no visible cells/)
  expect(() => renderCellsImage(canvas, {
    window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 }, cells: [],
    columnWidths: [16_000, 16_000],
  })).toThrow(/16 megapixels/)
  expect(context.fillRect).not.toHaveBeenCalled()
  expect(canvas.width).toBe(0)
})

test('draws the missing top and left frame without covering explicit borders', () => {
  const { canvas, context } = setup()
  const thick = { style: 'thick' as const, color: '#ff0000' }
  renderCellsImage(canvas, {
    window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 1 },
    cells: [{ row: 0, col: 1, displayValue: '', format: { borders: { top: thick } } }],
    rowHeights: [20, 20], columnWidths: [100, 50],
  })
  const moves = context.moveTo.mock.calls.map(([x, y]) => `${x},${y}`)
  expect(moves).toContain('0,0.5')
  expect(moves).not.toContain('100,0.5')
  expect(moves).toEqual(expect.arrayContaining(['0.5,0', '0.5,20']))
})

test('hidden gridlines leave the image without a frame', () => {
  const { canvas, context } = setup()
  renderCellsImage(canvas, { window, cells }, { theme: { gridline: 'transparent' } })
  const moves = context.moveTo.mock.calls.map(([x, y]) => `${x},${y}`)
  expect(moves).not.toContain('0,0.5')
  expect(moves).not.toContain('0.5,0')
})
