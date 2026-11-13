import { afterEach, expect, test, vi } from 'vitest'
import { createAutoFitMeasurer, type AutoFitLayout } from '../src/rust-workbook/auto-fit-measurement'

afterEach(() => vi.unstubAllGlobals())
const layout: AutoFitLayout = {
  fontFamily: 'Arial', fontSize: 20, lineHeight: 24,
  paddingTop: 3, paddingBottom: 3, paddingLeft: 7, paddingRight: 7,
  borderTop: 0, borderBottom: 1, borderLeft: 0, borderRight: 1,
}
function setup() {
  const context = { font: '', measureText(text: string) {
    const size = Number.parseFloat(this.font.match(/([\d.]+)px/)?.[1] ?? '20')
    return { width: Array.from(text).reduce((sum, char) => sum + (char === 'W' ? 1 : 0.5) * size, 0),
      fontBoundingBoxAscent: size * 0.8, fontBoundingBoxDescent: size * 0.2 }
  } }
  vi.stubGlobal('OffscreenCanvas', class { getContext() { return context } })
  return context
}

test('baseline auto-fit measures displayed glyphs and actual pads without changing nominal size', () => {
  setup()
  const measure = createAutoFitMeasurer('column', layout)
  const format = { fontSize: 20, fontBaseline: 'superscript' as const, numberFormat: { kind: 'custom' as const } }
  const input = { text: ' 12', pads: [{ char: 'W', at: 0 }], format, width: 120 }
  expect(measure(input)).toBeCloseTo(13 + 13 + 15)
  expect(format.fontSize).toBe(20)
  expect(measure({ ...input, format: { ...format, fontBaseline: 'normal' } })).toBe(55)
})

test('native rich descriptors measure inherited effects and explicit normal at their own font sizes', () => {
  setup()
  const measure = createAutoFitMeasurer('column', layout)
  const input = { text: 'H2O', format: { fontSize: 20, fontBaseline: 'superscript' as const }, width: 120,
    richText: [{ text: 'H', format: {} }, { text: '2', format: { fontBaseline: 'normal' as const } },
      { text: 'O', format: { fontBaseline: 'subscript' as const, fontSize: 30 } }] }
  expect(measure(input)).toBeCloseTo(6.5 + 10 + 9.75 + 15)
  expect(createAutoFitMeasurer('row', layout)(input)).toBeGreaterThanOrEqual(36 + 7)
})
