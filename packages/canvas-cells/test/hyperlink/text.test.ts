import { afterEach, expect, test, vi } from 'vitest'
import { paintText } from '../../src/text'
import { defaultTheme } from '../../src/types'
import { fixture } from '../fixture'

afterEach(() => vi.unstubAllGlobals())
test('canvas links match DOM color, preserve explicit foreground, and disappear in formula view', () => {
  const { context } = fixture()
  const ctx = context as unknown as CanvasRenderingContext2D
  const bounds = { x: 0, y: 0, width: 120, height: 28 }
  const cell = { row: 0, col: 0, displayValue: 'Website', hyperlink: 'https://example.com/' }
  paintText(ctx, bounds, cell, cell.displayValue, defaultTheme, false)
  expect(ctx.fillStyle).toBe(defaultTheme.selection)
  expect(context.stroke).toHaveBeenCalledTimes(1)
  context.stroke.mockClear()
  paintText(ctx, bounds, { ...cell, format: { fgColor: '#333333' } },
    cell.displayValue, defaultTheme, false)
  expect(ctx.fillStyle).toBe('#333333')
  context.stroke.mockClear()
  paintText(ctx, bounds, cell, cell.displayValue, defaultTheme, false, true)
  expect(ctx.fillStyle).toBe(defaultTheme.foreground)
  expect(context.stroke).not.toHaveBeenCalled()
  paintText(ctx, bounds, { ...cell, hyperlink: 'javascript:alert(1)' },
    cell.displayValue, defaultTheme, false)
  expect(context.stroke).not.toHaveBeenCalled()
})
