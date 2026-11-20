import { expect, test } from 'vitest'
import { CELL_FILL_PATTERNS, type SpreadsheetFillPattern } from '../src/contracts/cell-fill'
import { CELL_PATTERN_TILE_SIZE, patternFillRectangles } from '../src/fills/pattern-geometry'
import { patternFillImage } from '../src/fills/pattern-svg'

function mask(pattern: SpreadsheetFillPattern) {
  const pixels = Array.from({ length: 8 }, () => Array(8).fill(0) as number[])
  for (const [x, y, width, height] of patternFillRectangles(pattern)) {
    expect(x >= 0 && y >= 0 && x + width <= 8 && y + height <= 8).toBe(true)
    for (let row = y; row < y + height; row++)
      for (let col = x; col < x + width; col++) pixels[row]![col] = 1
  }
  return pixels
}

test('17 unique tiles preserve independent density vectors and up/down directions', () => {
  expect(CELL_PATTERN_TILE_SIZE).toBe(8)
  const expectedCoverage = [32, 48, 16, 32, 32, 32, 32, 28, 24, 8, 8, 8, 8, 15, 14, 8, 4]
  const masks = CELL_FILL_PATTERNS.map(mask)
  expect(masks.map(rows => rows.flat().reduce((sum, bit) => sum + bit, 0)))
    .toEqual(expectedCoverage)
  expect(new Set(masks.map(rows => JSON.stringify(rows))).size).toBe(17)
  expect(mask('lightDown')[1]).toEqual([0, 1, 0, 0, 0, 0, 0, 0])
  expect(mask('lightUp')[1]).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
  expect(mask('lightHorizontal')[0]).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
  expect(mask('lightVertical').map(row => row[0])).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
})

test('SVG output contains only bounded geometry and the validated foreground', () => {
  for (const pattern of CELL_FILL_PATTERNS) {
    const image = patternFillImage({ kind: 'pattern', pattern, foreground: '#123abc' })!
    expect(image.startsWith('url("data:image/svg+xml,')).toBe(true)
    const xml = decodeURIComponent(image.slice('url("data:image/svg+xml,'.length, -2))
    expect(xml).toContain('width="8" height="8"')
    expect(xml).toContain('fill="#123abc"')
    expect(xml).not.toMatch(/script|foreignObject|href|style=/)
    expect(image.length).toBeLessThan(5000)
  }
  expect(patternFillImage({ kind: 'pattern', pattern: 'lightDown', foreground: 'url(evil)' })).toBeUndefined()
})
