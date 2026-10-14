import { afterEach, expect, test, vi } from 'vitest'
import { createLayout } from '../src/layout'
import { paintCell } from '../src/paint-cell'
import { defaultTheme } from '../src/types'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())
test('clearing explicit borders restores gridlines without adding top or left grid edges', () => {
  const { context } = fixture()
  const none = { style: 'none' as const }
  const item = createLayout({ window: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    cells: [{ row: 0, col: 0, displayValue: '', format: {
      borders: { top: none, right: none, bottom: none, left: none },
    } }] }).items[0]
  paintCell(context as unknown as CanvasRenderingContext2D, { item, appearance: {
    hovered: false, selected: false, edges: 0, reference: false, showFormulas: false,
  } }, defaultTheme)
  expect(context.stroke).toHaveBeenCalledTimes(2)
  expect(context.moveTo).toHaveBeenCalledWith(119.5, 0)
  expect(context.moveTo).toHaveBeenCalledWith(0, 27.5)
})
