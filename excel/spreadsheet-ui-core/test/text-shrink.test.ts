import { expect, test, vi } from 'vitest'
import { textShrinkScale } from '../src/text/shrink-to-fit'

test('actual small-size shaping is checked instead of assuming proportional glyph widths', () => {
  // The browser regression measured a 16px identifier at 230.33px, but its first scaled
  // candidate still occupied 114.13px in a 105px box. Model that nonlinear width here.
  const measure = vi.fn((scale: number) => 230.328125 * scale * (scale < 0.5 ? 1.09 : 1))
  const scale = textShrinkScale({ shrinkToFit: true }, 'Identifier', 230.328125, 105, measure)
  expect(scale).toBeLessThan(105 / 230.328125)
  expect(measure(scale)).toBeLessThanOrEqual(105)
  expect(scale).toBeGreaterThan(0.4)
  expect(measure.mock.calls.length).toBeLessThanOrEqual(14)
})

test('discrete font metrics converge within a bounded number of measurements', () => {
  const measure = vi.fn((scale: number) => Math.ceil(scale * 100) + (scale > 0.4 ? 20 : 0))
  const scale = textShrinkScale({ shrinkToFit: true }, 'Identifier', 120, 50, measure)
  expect(measure(scale)).toBeLessThanOrEqual(50)
  expect(scale).toBeGreaterThan(0)
  expect(measure.mock.calls.length).toBeLessThanOrEqual(14)
})

test('short or inapplicable text never invokes scaled-font measurement', () => {
  const measure = vi.fn(() => 1)
  for (const [format, text] of [
    [{ shrinkToFit: false }, 'Long'], [{ shrinkToFit: true, wrap: true }, 'Long'],
    [{ shrinkToFit: true }, 'Two\nlines'],
    [{ shrinkToFit: true, rotation: 'vertical' as const }, 'Long'],
  ] as const) expect(textShrinkScale(format, text, 200, 100, measure)).toBe(1)
  expect(textShrinkScale({ shrinkToFit: true }, 'Short', 20, 100, measure)).toBe(1)
  expect(measure).not.toHaveBeenCalled()
})
