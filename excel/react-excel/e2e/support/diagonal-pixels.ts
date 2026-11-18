import type { Page } from '@playwright/test'

/** Measure colored stroke masks independently of SVG attributes or Canvas drawing calls. */
export async function diagonalPixels(page: Page, bytes: Buffer) {
  return page.evaluate(async data => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0); bitmap.close()
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const groups: { x: number; y: number }[][] = [[], [], []]
    const colors = [[192, 0, 0], [0, 0, 208], [0, 128, 0]]
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      const rgb = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]
      const coverage = (255 - Math.min(...rgb)) / 255
      if (coverage < 0.25 || pixels[i + 3]! < 100) continue
      const group = colors.findIndex(target => target.every((channel, index) =>
        Math.abs(255 - coverage * (255 - channel) - rgb[index]!) < 12))
      if (group >= 0) groups[group]!.push({ x, y })
    }
    return groups.map(points => {
      const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x))
      const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y))
      const mx = points.reduce((sum, p) => sum + p.x, 0) / points.length
      const my = points.reduce((sum, p) => sum + p.y, 0) / points.length
      const variance = points.reduce((sum, p) => sum + (p.x - mx) ** 2, 0)
      const covariance = points.reduce((sum, p) => sum + (p.x - mx) * (p.y - my), 0)
      const sampleX = Math.round(left + (right - left) * 0.25)
      const ys = points.filter(p => p.x === sampleX).map(p => p.y).sort((a, b) => a - b)
      let bands = 0
      for (let i = 0; i < ys.length; i++) if (!i || ys[i]! > ys[i - 1]! + 1) bands++
      return { count: points.length, left, right, top, bottom, width: right - left + 1,
        height: bottom - top + 1, slope: covariance / variance, bands }
    })
  }, bytes.toString('base64'))
}
