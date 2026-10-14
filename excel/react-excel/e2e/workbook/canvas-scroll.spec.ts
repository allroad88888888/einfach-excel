import { expect, test } from '@playwright/test'

for (const rate of [1, 4]) {
test(`rapid scroll retains painted coverage with CPU throttling ${rate}x`, async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  await page.goto('/?renderer=canvas')
  const canvasLocator = page.locator('[data-workbook-grid] canvas')
  await expect(canvasLocator).toHaveAttribute('data-painted-cells', /[1-9]\d*/)
  const observedFrames = await page.evaluate(async () => {
    const scroll = document.querySelector<HTMLElement>('.sheet-scroll')!
    const samples: { frame: number; missing: number; alpha: number }[] = []
    for (let frame = 0; frame < 72; frame++) {
      scroll.scrollTop += frame < 36 ? 84 : -84
      await new Promise(requestAnimationFrame)
      const canvas = document.querySelector<HTMLCanvasElement>('[data-workbook-grid] canvas')!
      const box = canvas.getBoundingClientRect(), viewport = scroll.getBoundingClientRect()
      const top = viewport.top + 29, bottom = viewport.top + scroll.clientHeight - 2
      const missing = Math.max(0, box.top - top) + Math.max(0, bottom - box.bottom)
      const x = Math.max(1, viewport.left + 70 - box.left)
      const y = Math.max(1, Math.min(box.height - 2, bottom - box.top - 2))
      const ratio = canvas.width / parseFloat(canvas.style.width)
      const alpha = canvas.getContext('2d')!.getImageData(x * ratio, y * ratio, 1, 1).data[3]
      samples.push({ frame, missing, alpha })
    }
    return samples
  })
  expect(observedFrames.filter(sample => sample.missing > 1 || sample.alpha !== 255)).toEqual([])
})
}
