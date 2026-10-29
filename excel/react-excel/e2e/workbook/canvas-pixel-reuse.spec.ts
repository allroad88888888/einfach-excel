import type * as CanvasApi from '@einfach-excel/canvas'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const modulePath = `/@fs${fileURLToPath(new URL('../../../../packages/canvas/src/index.ts', import.meta.url))}`

for (const ratio of [1, 1.25, 2]) {
  test(`scroll pixel reuse matches a full repaint at DPR ${ratio}`, async ({ page }) => {
    await page.goto('/?renderer=canvas')
    const result = await page.evaluate(async ({ dpr, source }) => {
      const { createCanvas } = await import(source) as typeof CanvasApi
      const samples: { step: number; different: number }[] = []
      let reused = 0, highlighted = false
      const surfaces = [true, false].map(reusePixels => {
        const canvas = document.createElement('canvas')
        const surface = createCanvas(canvas, {
          store: {} as Parameters<typeof createCanvas>[1]['store'], width: 240, height: 112,
          pixelRatio: dpr, reusePixels,
          onFrame: stats => { if (reusePixels) reused += stats.reusedPixels ?? 0 },
        })
        const cells = Array.from({ length: 100 }, (_, index) => {
          const bounds = { x: index % 5 * 80, y: Math.floor(index / 5) * 28, width: 80, height: 28 }
          return surface.createCell(bounds, () => ctx => {
            ctx.fillStyle = highlighted && index === 7 ? '#acf' : index % 2 ? '#fff' : '#edf3fa'
            ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)
            ctx.font = '12px Arial'; ctx.fillStyle = '#123'
            ctx.fillText(`Row ${index}`, bounds.x + 3, bounds.y + 18)
            ctx.strokeStyle = '#bcd'; ctx.lineWidth = 1
            ctx.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.width - 1, bounds.height - 1)
          })
        })
        // A translucent merged region exercises overlap and transparent pixels after the grid ends.
        surface.createCell({ x: 160, y: 20, width: 80, height: 10000 }, () => ctx => {
          ctx.fillStyle = 'rgba(100,180,100,.3)'; ctx.fillRect(160, 20, 80, 10000)
        })
        surface.flush()
        return { canvas, surface, cells }
      })
      try {
        const positions = [[0, 28], [80, 56], [84, 60], [40, 32], [0, 0],
          [0.5, 0.5], [0, 540], [0, 560], [0, 800], [80, 780], [0, 0]]
        for (const [step, [x, y]] of positions.entries()) {
          highlighted = step % 2 === 0
          for (const [index, entry] of surfaces.entries()) {
            entry.cells[7]!.invalidate()
            entry.surface.setViewport({ x: x!, y: y!, width: 240, height: 112 })
            if (index === 1) entry.surface.invalidate()
            entry.surface.flush()
          }
          const pixels = surfaces.map(({ canvas }) => canvas.getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data)
          let different = 0
          for (let i = 0; i < pixels[0]!.length; i++) {
            if (pixels[0]![i] !== pixels[1]![i]) different++
          }
          samples.push({ step, different })
        }
      } finally { for (const entry of surfaces) entry.surface.dispose() }
      return { samples, reused }
    }, { dpr: ratio, source: modulePath })
    expect(result.reused).toBeGreaterThan(0)
    expect(result.samples.filter(sample => sample.different)).toEqual([])
  })
}
