import { afterEach, expect, test, vi } from 'vitest'
import type { DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import { createLayout } from '../src/layout'
import { paintCell } from '../src/paint-cell'
import { defaultTheme } from '../src/types'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())
const across = { align: 'centerAcross' as const }
const cell = (col: number, displayValue: string, row = 0): DisplayCell =>
  ({ row, col, displayValue, format: across })
const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 3 }
const appearance = {
  hovered: false, selected: false, edges: 0, reference: false, showFormulas: false,
}

test('the run covers the anchor and following empty centerAcross cells, a non-empty cell ends it', () => {
  const layout = createLayout({ window, columnWidths: [100, 80, 60, 40],
    cells: [cell(0, 'Title'), cell(1, ''), cell(2, 'Stop'), cell(3, '')] })
  const [a, b, c, d] = layout.items
  expect(a.across?.bounds).toEqual({ x: 0, y: 0, width: 180, height: 28 })
  expect(b.across).toEqual(a.across)
  // 'Stop' 自己成为新的锚点，只吞并后面的空格 d。
  expect(c.across?.bounds).toEqual({ x: 180, y: 0, width: 100, height: 28 })
  expect(c.across?.cell.displayValue).toBe('Stop')
  expect(d.across).toEqual(c.across)
})

test('an empty cell without centerAcross ends the run and a lone anchor has no run', () => {
  const layout = createLayout({ window, columnWidths: [100, 80, 60, 40],
    cells: [cell(0, 'Title'), { row: 0, col: 1, displayValue: '' }, cell(2, '')] })
  expect(layout.items.every(item => item.across === undefined)).toBe(true)
})

test('each covered cell paints the centered text clipped to its own slice', () => {
  const { context } = fixture()
  const layout = createLayout({ window, columnWidths: [100, 100, 100, 100],
    cells: [cell(0, 'Title'), cell(1, ''), cell(2, '')] })
  context.fillText.mockClear()
  for (const item of layout.items.slice(0, 3)) {
    paintCell(context as unknown as CanvasRenderingContext2D, { item, appearance }, defaultTheme)
  }
  const xs = context.fillText.mock.calls.map(call => call[1])
  // 整段 300px，文字区 7..293 的中心是 150，三格画同一个点。
  expect(context.fillText).toHaveBeenCalledTimes(3)
  expect(new Set(xs)).toEqual(new Set([150]))
})
