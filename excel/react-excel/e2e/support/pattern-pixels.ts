import { expect, type Page } from '@playwright/test'

// Independent eight-row bit masks: expected raster shapes, not values imported from the renderer.
const zero = '00000000', one = '11111111'
export const patternMasks: Record<string, readonly string[]> = {
  mediumGray: ['10101010', '01010101', '10101010', '01010101', '10101010', '01010101', '10101010', '01010101'],
  darkGray: ['01010101', one, '01010101', one, '01010101', one, '01010101', one],
  lightGray: ['10101010', zero, '10101010', zero, '10101010', zero, '10101010', zero],
  darkHorizontal: [one, one, zero, zero, one, one, zero, zero],
  darkVertical: Array(8).fill('11001100'),
  darkDown: ['11001100', '01100110', '00110011', '10011001', '11001100', '01100110', '00110011', '10011001'],
  darkUp: ['11001100', '10011001', '00110011', '01100110', '11001100', '10011001', '00110011', '01100110'],
  darkGrid: [one, '10001000', '10001000', '10001000', one, '10001000', '10001000', '10001000'],
  darkTrellis: ['10001000', '01010101', '00100010', '01010101', '10001000', '01010101', '00100010', '01010101'],
  lightHorizontal: [one, zero, zero, zero, zero, zero, zero, zero],
  lightVertical: Array(8).fill('10000000'),
  lightDown: ['10000000', '01000000', '00100000', '00010000', '00001000', '00000100', '00000010', '00000001'],
  lightUp: ['10000000', '00000001', '00000010', '00000100', '00001000', '00010000', '00100000', '01000000'],
  lightGrid: [one, '10000000', '10000000', '10000000', '10000000', '10000000', '10000000', '10000000'],
  lightTrellis: ['10000000', '01000001', '00100010', '00010100', '00001000', '00010100', '00100010', '01000001'],
  gray125: ['10001000', zero, '10001000', zero, '10001000', zero, '10001000', zero],
  gray0625: ['10001000', zero, zero, zero, '10001000', zero, zero, zero],
}

/** Sample an interior logical tile, avoiding borders and text; the screenshot is the only input. */
export async function patternPixels(page: Page, bytes: Buffer, scale = 1, x = 16, y = 16) {
  return page.evaluate(async ({ data, scale, x, y }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0); bitmap.close()
    const result: number[][] = []
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const color = ctx.getImageData(Math.floor((x + col + 0.5) * scale),
        Math.floor((y + row + 0.5) * scale), 1, 1).data
      result.push([...color].slice(0, 3))
    }
    return result
  }, { data: bytes.toString('base64'), scale, x, y })
}

export function assertPatternPixels(pixels: number[][], pattern: string,
  foreground = [192, 0, 0], background = [255, 242, 204]) {
  const near = (actual: number[], expected: number[]) => actual.every((v, i) => Math.abs(v - expected[i]!) <= 2)
  expect(pixels.every(pixel => near(pixel, foreground) || near(pixel, background))).toBe(true)
  const bits = pixels.map(pixel => near(pixel, foreground) ? '1' : '0').join('')
  const rows = patternMasks[pattern]!
  // Screenshots round fractional cell borders; phase may shift, but direction and density must match.
  const phases: string[] = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    phases.push(Array.from({ length: 64 }, (_, i) => rows[(Math.floor(i / 8) + y) % 8]![(i % 8 + x) % 8]).join(''))
  }
  expect(phases, `${pattern}: ${bits}`).toContain(bits)
  expect(bits.split('1').length - 1).toBe(rows.join('').split('1').length - 1)
}
