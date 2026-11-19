import { expect, test } from 'vitest'
import { gradientColorAt } from '../src/fills/gradient-stops'
import { linearGradientVector, pathGradientGeometry } from '../src/fills/gradient-geometry'
import { gradientFillImage } from '../src/fills/gradient-svg'
import type { SpreadsheetPathGradientFill } from '../src/contracts/cell-fill'

const stops = [{ position: 0, color: '#ff0000' }, { position: 1, color: '#0000ff' }]
const fill: SpreadsheetPathGradientFill = { kind: 'path-gradient', left: 0.25, right: 0.75,
  top: 0.25, bottom: 0.75, stops }

test('linear vectors project the whole non-square box rather than connecting its corners', () => {
  expect(linearGradientVector(0, 128, 64)).toEqual({ from: [0, 32], to: [128, 32] })
  expect(linearGradientVector(90, 128, 64)).toEqual({ from: [64, 0], to: [64, 64] })
  expect(linearGradientVector(-450, 128, 64)).toEqual({ from: [64, 64], to: [64, 0] })
  const diagonal = linearGradientVector(45, 128, 64)
  diagonal.from.forEach((value, index) => expect(value).toBeCloseTo([16, -16][index], 10))
  diagonal.to.forEach((value, index) => expect(value).toBeCloseTo([112, 80][index], 10))
})

test('path geometry has rectangular distance regions and preserves inverted persisted edges', () => {
  const geometry = pathGradientGeometry(fill)
  expect(geometry.regions).toHaveLength(4)
  expect(geometry.regions[0]).toEqual({ polygon: [[0, 0], [1, 0], [0.75, 0.25], [0.25, 0.25]],
    from: [0, 0.25], to: [0, 0] })
  expect(pathGradientGeometry({ ...fill, left: 0.75, right: 0.25 })).toEqual(geometry)
  expect(pathGradientGeometry({ ...fill, left: 0, top: 0, right: 1, bottom: 1 }).regions)
    .toHaveLength(0)
  expect(pathGradientGeometry({ ...fill, left: 0, top: 0, right: 0, bottom: 0 }).regions)
    .toHaveLength(2)
})

test('sRGB sampling keeps hard edges, empty fallback and missing endpoint extensions', () => {
  expect(gradientColorAt(stops, 0.5)).toBe('#800080')
  expect(gradientColorAt([], 0.5, '#123456')).toBe('#123456')
  const hard = [{ position: 0.75, color: '#0000ff' }, { position: 0.25, color: '#ff0000' },
    { position: 0.75, color: '#00ff00' }]
  expect(gradientColorAt(hard, 0)).toBe('#ff0000')
  expect(gradientColorAt(hard, 0.5)).toBe('#800080')
  expect(gradientColorAt(hard, 0.75)).toBe('#00ff00')
  expect(gradientColorAt(hard, 1)).toBe('#00ff00')
  expect(hard[0].position).toBe(0.75)
})

test('DOM gradients use safe sRGB paints and bounded path regions without radial interpolation', () => {
  expect(gradientFillImage({ kind: 'linear-gradient', degree: -450, stops }))
    .toBe('linear-gradient(0deg in srgb, #ff0000 0%, #0000ff 100%)')
  const svg = decodeURIComponent(gradientFillImage(fill)!)
  expect(svg.match(/<linearGradient /g)).toHaveLength(4)
  expect(svg).not.toContain('radialGradient')
  expect(svg).toContain('color-interpolation="sRGB"')
  expect(gradientFillImage({ ...fill, stops: [] })).toBeUndefined()
  expect(gradientFillImage({ ...fill, stops: [{ position: 0, color: 'url(evil)' }] })).toBeUndefined()
})
