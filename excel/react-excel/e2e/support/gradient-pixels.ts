import { expect, type Page } from '@playwright/test'

export interface GradientSpec {
  kind: 'linear-gradient' | 'path-gradient'
  degree?: number
  left?: number
  right?: number
  top?: number
  bottom?: number
  stops: { position: number; color: string }[]
}
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

// Independent acceptance oracle: distance and color interpolation, without importing product geometry.
function expected(fill: GradientSpec, x: number, y: number, width: number, height: number) {
  let position: number
  if (fill.kind === 'linear-gradient') {
    const angle = (fill.degree! % 360) * Math.PI / 180
    const dx = Math.cos(angle), dy = Math.sin(angle)
    position = 0.5 + ((x - width / 2) * dx + (y - height / 2) * dy)
      / (Math.abs(width * dx) + Math.abs(height * dy))
  } else {
    const l = Math.min(fill.left!, fill.right!), r = Math.max(fill.left!, fill.right!)
    const t = Math.min(fill.top!, fill.bottom!), b = Math.max(fill.top!, fill.bottom!)
    position = Math.max(0, l ? (l - x / width) / l : 0,
      r < 1 ? (x / width - r) / (1 - r) : 0,
      t ? (t - y / height) / t : 0, b < 1 ? (y / height - b) / (1 - b) : 0)
  }
  const ordered = [...fill.stops].sort((a, b) => a.position - b.position)
  if (!ordered.length) return rgb('#123456')
  let previous = ordered[0]!
  if (position < previous.position) return rgb(previous.color)
  for (const next of ordered.slice(1)) {
    if (position < next.position) {
      const ratio = (position - previous.position) / (next.position - previous.position)
      return rgb(previous.color).map((v, i) => Math.round(v + (rgb(next.color)[i]! - v) * ratio))
    }
    previous = next
  }
  return rgb(previous.color)
}

/** Includes diagonals shared by adjacent path regions; no seam pixels are masked. */
export async function assertGradientPixels(page: Page, bytes: Buffer, fill: GradientSpec,
  scale = 1, offsetX = 0, offsetY = 0, width = 128, height = 64) {
  const samples = await page.evaluate(async ({ data, scale, offsetX, offsetY, width, height }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close()
    const samples: { x: number; y: number; color: number[] }[] = []
    for (let y = 7; y < height - 6; y += 7) for (let x = 7; x < width - 6; x += 7) {
      const px = Math.floor((offsetX + x + 0.5) * scale), py = Math.floor((offsetY + y + 0.5) * scale)
      samples.push({ x: (px + 0.5) / scale - offsetX, y: (py + 0.5) / scale - offsetY,
        color: [...ctx.getImageData(px, py, 1, 1).data].slice(0, 3) })
    }
    return samples
  }, { data: bytes.toString('base64'), scale, offsetX, offsetY, width, height })
  for (const sample of samples) {
    const target = expected(fill, sample.x, sample.y, width, height)
    expect(Math.max(...sample.color.map((v, i) => Math.abs(v - target[i]!))),
      `${fill.kind} at ${sample.x},${sample.y}; actual ${sample.color}, expected ${target}`).toBeLessThanOrEqual(6)
  }
}
