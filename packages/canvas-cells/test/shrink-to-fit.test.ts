import { afterEach, expect, test, vi } from 'vitest'
import type { DisplayCell, SpreadsheetCellFormat } from '@einfach-excel/spreadsheet-ui-core'
import { paintText } from '../src/text'
import { defaultTheme } from '../src/types'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())
function draw(text: string, format: SpreadsheetCellFormat, width: number,
  extra: Partial<DisplayCell> = {}) {
  const { context } = fixture()
  const ctx = context as unknown as CanvasRenderingContext2D
  const size = () => Number.parseFloat(ctx.font.match(/([\d.]+)px/)?.[1] ?? '20')
  context.measureText = (value: string) => ({
    width: (Array.from(value).reduce((sum, char) => sum +
      (char === 'W' ? 1.5 : char === ' ' ? 0.25 : 0.5), 0) - (value.match(/AV/g)?.length ?? 0) * 0.2) * size(),
    fontBoundingBoxAscent: size() * 0.8, fontBoundingBoxDescent: size() * 0.2,
  } as TextMetrics)
  const painted: { text: string; x: number; y: number; size: number; width: number }[] = []
  context.fillText.mockImplementation((value: string, x: number, y: number) => {
    painted.push({ text: value, x, y, size: size(), width: ctx.measureText(value).width })
  })
  const cell: DisplayCell = { row: 0, col: 0, valueKind: 'text', displayValue: text,
    format: { fontSize: 20, ...format }, ...extra }
  const before = structuredClone(cell)
  paintText(ctx, { x: 0, y: 0, width, height: 60 }, cell, text, defaultTheme, false)
  expect(cell).toEqual(before)
  return painted
}

test('custom padding participates in shrink width while fill endpoints stay at the original edges', () => {
  const painted = draw('$ 12', { shrinkToFit: true }, 44, {
    numberFormatDisplay: { pads: [{ at: 1, char: 'W' }], fill: { at: 1, char: ' ' } },
  })
  expect(painted.map(call => call.text)).toEqual(['$', '12'])
  expect(painted.map(call => call.size)).toEqual([10, 10])
  expect(painted.map(call => call.x)).toEqual([7, 37])
})

test('rich shrink uses the final kerning chunks and one scale for different nominal sizes', () => {
  const painted = draw('AVx', { shrinkToFit: true, overflow: 'clip' }, 34, {
    richText: [{ text: 'AV', format: {} }, { text: 'x', format: { fontSize: 32 } }],
  })
  expect(painted.map(call => call.text)).toEqual(['AV', 'x'])
  expect(painted.map(call => call.size)).toEqual([12.5, 20])
  expect(painted.reduce((sum, call) => sum + call.width, 0)).toBeCloseTo(20)
  expect(painted[1]!.x + painted[1]!.width).toBeCloseTo(27)
})

test('short text never grows and multiline or vertical content never shrinks', () => {
  expect(draw('Short', { shrinkToFit: true }, 300)[0]!.size).toBe(20)
  for (const format of [{}, { wrap: true }, { rotation: 'vertical' as const }]) {
    expect(draw('Long\ntext', { ...format, shrinkToFit: true }, 24)
      .every(call => call.size === 20)).toBe(true)
    expect(draw('Long\ntext', { ...format, shrinkToFit: true }, 24, {
      richText: [{ text: 'Long\ntext', format: {} }],
    }).every(call => call.size === 20)).toBe(true)
  }
})
