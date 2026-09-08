import { afterEach, expect, test, vi } from 'vitest'
import {
  createAutoFitMeasurer,
  type AutoFitLayout,
  type AutoFitText,
} from '../src/rust-workbook/auto-fit-measurement'

afterEach(() => vi.unstubAllGlobals())
const layout: AutoFitLayout = {
  fontFamily: 'Arial',
  fontSize: 12,
  lineHeight: 14.4,
  paddingTop: 3,
  paddingBottom: 3,
  paddingLeft: 7,
  paddingRight: 7,
  borderTop: 0,
  borderBottom: 1,
  borderLeft: 0,
  borderRight: 1,
}

function setup() {
  const context = {
    font: '',
    measureText: vi.fn((text: string) => ({ width: [...text].length * 10 })),
  }
  const canvas = vi.fn(function () {
    return { getContext: () => context }
  })
  vi.stubGlobal('OffscreenCanvas', canvas)
  return { context, canvas }
}
const text = (format: AutoFitText['format'] = {}, raw = 'abcd'): AutoFitText => ({
  text: raw,
  width: 55,
  format,
})

test('one canvas per command, with effective font, indent and borders per cell', () => {
  const { context, canvas } = setup()
  const measure = createAutoFitMeasurer('column', layout)
  expect(measure(text())).toBe(55)
  expect(
    measure(
      text({
        bold: true,
        italic: true,
        fontSize: 36,
        fontFamily: 'Georgia',
        indent: 2,
        borders: { left: { style: 'thick' } },
      }),
    ),
  ).toBe(67)
  expect(context.font).toBe('italic bold 36px Georgia')
  measure(text({ fontFamily: 'url(invalid)', fontSize: -1 }))
  expect(context.font).toBe('normal normal 12px Arial')
  expect(canvas).toHaveBeenCalledTimes(1)
})

test('measurement uses the same numeric display formatter as visible projections', () => {
  const { context } = setup()
  createAutoFitMeasurer(
    'column',
    layout,
  )({ ...text({ numberFormat: { kind: 'percent', digits: 2 } }), numericValue: 0.1234 })
  expect(context.measureText).toHaveBeenCalledWith('12.34%')
})

test('row fitting respects explicit lines, wrapping and per-cell font size', () => {
  setup()
  const measure = createAutoFitMeasurer('row', layout)
  expect(measure(text({}, 'a\nb'))).toBeCloseTo(21.4)
  expect(measure(text({ wrap: true }, '中文\n第二行\nthird'))).toBeCloseTo(64.6)
  expect(measure(text({ wrap: true }, 'abcdefgh'))).toBeCloseTo(35.8)
  expect(measure(text({ wrap: true }, 'abcd efgh'))).toBeCloseTo(35.8)
  expect(measure(text({ fontSize: 36 }))).toBeCloseTo(50.2)
})

test('rotation uses rotated dimensions rather than the unrotated line width', () => {
  setup()
  expect(createAutoFitMeasurer('row', layout)(text({ rotation: 90 }))).toBeCloseTo(47)
  expect(createAutoFitMeasurer('column', layout)(text({ rotation: 90 }))).toBeCloseTo(29.4)
  expect(createAutoFitMeasurer('row', layout)(text({ rotation: 'vertical' }, '中文'))).toBeCloseTo(
    31,
  )
})

test('missing browser measurement and invalid layout fail rather than guess character widths', () => {
  vi.stubGlobal('OffscreenCanvas', undefined)
  expect(() => createAutoFitMeasurer('row', layout)).toThrow('measurement is unavailable')
  setup()
  expect(() => createAutoFitMeasurer('row', { ...layout, fontSize: NaN })).toThrow(
    'layout is unavailable',
  )
})
