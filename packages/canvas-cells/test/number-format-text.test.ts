import { afterEach, expect, test, vi } from 'vitest'
import type { DisplayCell } from '@einfach-excel/spreadsheet-ui-core'
import { paintText } from '../src/text'
import { defaultTheme } from '../src/types'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())
const bounds = { x: 0, y: 0, width: 120, height: 28 }

function paint(cell: DisplayCell) {
  const { context } = fixture()
  const styles: unknown[] = []
  context.fillText.mockImplementation(function (this: unknown) {
    styles.push((context as unknown as { fillStyle: unknown }).fillStyle)
  })
  paintText(context as unknown as CanvasRenderingContext2D, bounds, cell, cell.displayValue,
    defaultTheme, false)
  return { calls: context.fillText.mock.calls, styles }
}

test('section color overrides the explicit font color', () => {
  const { styles } = paint({ row: 0, col: 0, displayValue: '(5)', valueKind: 'number',
    format: { fgColor: '#00ff00' }, numberFormatDisplay: { color: '#ff0000' } })
  expect(styles).toEqual(['#ff0000'])
})

test('fill draws the left part at the padding, the right part at the edge and repeats the char', () => {
  // 内容区从 x=7 起，宽 120-14=106；测宽假件按每字符 7px。
  const { calls } = paint({ row: 0, col: 0, displayValue: '$12', valueKind: 'number',
    numberFormatDisplay: { fill: { char: '-', at: 1 } } })
  expect(calls[0]).toEqual(['$', 7, expect.any(Number)])
  expect(calls[1]).toEqual(['12', 113, expect.any(Number)])
  expect(calls[2]![0]).toBe('-'.repeat(Math.floor((106 - 7 - 14) / 7)))
  expect(calls[2]![1]).toBe(14)
})

test('space fill leaves only a gap', () => {
  const { calls } = paint({ row: 0, col: 0, displayValue: ' $1 ', valueKind: 'number',
    numberFormatDisplay: { fill: { char: ' ', at: 2 } } })
  expect(calls.map((call) => call[0])).toEqual([' $', '1 '])
})

test('underscore pads advance by the padded character width without drawing it', () => {
  // `_W0_)`：测宽假件每字符 7px；右对齐时 ")" 的宽度留在 "7" 右边。
  const { calls } = paint({ row: 0, col: 0, displayValue: ' 7 ', valueKind: 'number',
    numberFormatDisplay: { pads: [{ char: 'W', at: 0 }, { char: ')', at: 2 }] } })
  expect(calls).toEqual([['7', 113 - 7, expect.any(Number)]])
})

test('pads inside a fill keep the right part flush with the edge', () => {
  const { calls } = paint({ row: 0, col: 0, displayValue: ' $1 ', valueKind: 'number',
    numberFormatDisplay: { fill: { char: ' ', at: 2 },
      pads: [{ char: '(', at: 0 }, { char: ')', at: 3 }] } })
  expect(calls).toEqual([['$', 14, expect.any(Number)], ['1', 113 - 7, expect.any(Number)]])
})

test('centered pads reserve their width on both sides of the text', () => {
  const { calls } = paint({ row: 0, col: 0, displayValue: ' 7', valueKind: 'number',
    format: { align: 'center' }, numberFormatDisplay: { pads: [{ char: 'W', at: 0 }] } })
  expect(calls).toEqual([['7', 7 + 53 - 7 + 7, expect.any(Number)]])
})
