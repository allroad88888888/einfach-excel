import { afterEach, expect, test, vi } from 'vitest'
import type { DisplayCell, FontBaseline } from '@einfach-excel/spreadsheet-ui-core'
import { paintText } from '../src/text'
import { defaultTheme } from '../src/types'
import { fixture } from './fixture'

afterEach(() => vi.unstubAllGlobals())
function draw(baseline: FontBaseline, richText?: DisplayCell['richText']) {
  const { context } = fixture()
  const ctx = context as unknown as CanvasRenderingContext2D
  context.measureText = (text: string) => {
    const size = Number.parseFloat(ctx.font.match(/([\d.]+)px/)?.[1] ?? '20')
    return { width: text.length * size * 0.5, fontBoundingBoxAscent: size * 0.8,
      fontBoundingBoxDescent: size * 0.2 } as TextMetrics
  }
  const painted: { text: string; x: number; y: number; font: string; baseline: string }[] = []
  context.fillText.mockImplementation((text: string, x: number, y: number) => {
    painted.push({ text, x, y, font: ctx.font, baseline: ctx.textBaseline })
  })
  const cell: DisplayCell = { row: 0, col: 0, displayValue: '$12', valueKind: 'text',
    format: { fontSize: 20, fontBaseline: baseline }, richText,
    numberFormatDisplay: { fill: { char: ' ', at: 1 } } }
  paintText(ctx, { x: 0, y: 0, width: 120, height: 40 },
    cell, cell.displayValue, defaultTheme, false)
  return painted
}

test('baseline moves glyphs and scales their font while Accounting endpoints retain the full box', () => {
  const superscript = draw('superscript'), subscript = draw('subscript')
  expect(superscript.map(call => call.x)).toEqual([7, 113])
  expect(subscript.map(call => call.x)).toEqual([7, 113])
  expect(superscript[0]!.font).toContain('13px')
  expect(superscript[0]!.baseline).toBe('alphabetic')
  // The nominal line strut and measured descent keep each effect inside its line box.
  expect(superscript[0]!.y).toBeCloseTo(24.2)
  expect(subscript[0]!.y).toBeCloseTo(32.7)
})

test('rich explicit normal is painted at nominal size while absent baseline inherits once', () => {
  const painted = draw('superscript', [
    { text: 'H', format: {} }, { text: '2', format: { fontBaseline: 'normal' } },
    { text: 'O', format: { fontBaseline: 'subscript' } },
  ])
  expect(painted.map(call => call.font.match(/[\d.]+px/)![0])).toEqual(['13px', '20px', '13px'])
  expect(painted[0]!.y).toBeLessThan(painted[1]!.y)
  expect(painted[2]!.y).toBeGreaterThan(painted[1]!.y)
})
