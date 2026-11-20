import { expect, type Page } from '@playwright/test'

/** Distinct glyph colors let us inspect actual raster pixels without counting grid/selection lines. */
export const baselinePixelFile = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Baseline pixels',
  canvases: [{ rowCount: 30, colCount: 8 }],
  workbook: { version: 1, sheets: [{ idx: 0, name: 'Pixels', defaults: { rowHeight: 60 } }],
    cells: ['A1', 'B1', 'C1'].map((addr, col) => ({ sheet: 0, addr, row: 0, col, kind: 'text', value: 'Hg' })),
    formats: [{ sheet: 0, startRow: 0, endRow: 0, startCol: 0, endCol: 2,
      cellStyles: ['normal', 'superscript', 'subscript'].map((fontBaseline, col) => ({
        addr: `${String.fromCharCode(65 + col)}1`,
        format: { fontSize: 20, fontFamily: 'Arial', fgColor: ['#d00000', '#008000', '#0000d0'][col], fontBaseline },
      })) }],
  },
}))

export async function glyphPixels(page: Page, bytes: Buffer, includeAntialias = false) {
  return page.evaluate(async ({ data, includeAntialias }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0); bitmap.close()
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const boxes = [0, 1, 2].map(() => ({ left: canvas.width, top: canvas.height, right: 0, bottom: 0, count: 0 }))
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      const rgb = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]
      const color = [[208, 0, 0], [0, 128, 0], [0, 0, 208]].findIndex(target => {
        if (!includeAntialias) return target.every((channel, index) => Math.abs(channel - rgb[index]!) < 10)
        // Small glyphs can contain almost no solid-color pixels. Recover coverage
        // against this fixture's white background and reject grid/selection colors.
        const coverage = (255 - Math.min(...rgb)) / 255
        return coverage >= 0.15 && target.every((channel, index) =>
          Math.abs(255 - coverage * (255 - channel) - rgb[index]!) < 10)
      })
      if (color < 0 || pixels[i + 3]! < 100) continue
      const box = boxes[color]!
      box.left = Math.min(box.left, x); box.right = Math.max(box.right, x)
      box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y); box.count++
    }
    return boxes.map(box => ({ ...box, height: box.bottom - box.top + 1,
      center: (box.top + box.bottom) / 2 }))
  }, { data: bytes.toString('base64'), includeAntialias })
}

export function expectBaselinePixels(boxes: Awaited<ReturnType<typeof glyphPixels>>) {
  const [normal, superscript, subscript] = boxes
  for (const box of boxes) expect(box.count).toBeGreaterThan(10)
  expect(superscript!.height).toBeLessThan(normal!.height * 0.85)
  expect(subscript!.height).toBeLessThan(normal!.height * 0.85)
  expect(superscript!.center).toBeLessThan(normal!.center - 1)
  expect(subscript!.center).toBeGreaterThan(superscript!.center + 4)
  expect(superscript!.left).toBeGreaterThan(normal!.right)
  expect(subscript!.left).toBeGreaterThan(superscript!.right)
}
