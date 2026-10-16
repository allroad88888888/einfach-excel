import { expect, test } from '@playwright/test'

for (const ratio of [1, 2]) {
  test.describe(`scroll coverage at DPR ${ratio}`, () => {
    test.use({ deviceScaleFactor: ratio })

    test('small scrolls have painted edges before the scroll handler runs', async ({ page }) => {
      await page.goto('/?renderer=canvas')
      const canvas = page.locator('[data-workbook-grid] canvas')
      await expect(canvas).toHaveAttribute('data-painted-cells', /[1-9]\d*/)
      await page.locator('.sheet-scroll').evaluate(el => {
        el.scrollTop = 280; el.scrollLeft = 600
      })
      await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
      const gaps = await canvas.evaluate(async node => {
        const el = node as HTMLCanvasElement, scroll = el.closest('.sheet-scroll')!
        const failures: {
          dx: number; dy: number; edge: number; opaque: boolean; painted: boolean
        }[] = []
        await new Promise(requestAnimationFrame)
        for (const [dx, dy] of [[0, 7], [0, -7], [11, 0], [-11, 0], [84, 84], [-84, -84]]) {
          scroll.scrollLeft += dx!; scroll.scrollTop += dy!
          // Intentionally read before yielding to the scroll handler: native scrolling can
          // expose this already-painted bitmap while the main thread has not caught up yet.
          const box = el.getBoundingClientRect(), pane = scroll.getBoundingClientRect()
          const left = pane.left + scroll.clientLeft + 46, top = pane.top + scroll.clientTop + 28
          const right = pane.left + scroll.clientLeft + scroll.clientWidth
          const bottom = pane.top + scroll.clientTop + scroll.clientHeight
          const strips = [[left + 20, top + 1, 240, 1], [left + 20, bottom - 2, 240, 1],
            [left + 1, top + 20, 1, 56], [right - 2, top + 20, 1, 56]]
          const scale = el.width / box.width
          for (const [edge, [x, y, width, height]] of strips.entries()) {
            const pixels = el.getContext('2d')!.getImageData(
              (x! - box.left) * scale, (y! - box.top) * scale, width! * scale, height! * scale).data
            let opaque = true, painted = false
            for (let i = 0; i < pixels.length; i += 4) {
              opaque &&= pixels[i + 3] === 255
              painted ||= pixels[i]! + pixels[i + 1]! + pixels[i + 2]! < 750
                && pixels[i + 3] === 255
            }
            if (!opaque || !painted) failures.push({ dx: dx!, dy: dy!, edge, opaque, painted })
          }
          await new Promise(requestAnimationFrame)
        }
        return failures
      })
      expect(gaps).toEqual([])
    })
  })
}

test('painted margins do not extend the sheet scroll range at its far edges', async ({ page }) => {
  await page.goto('/?renderer=canvas')
  await expect(page.locator('[data-workbook-grid] canvas')).toHaveAttribute('data-painted-cells', /[1-9]\d*/)
  const before = await page.locator('.sheet-scroll').evaluate(el => {
    const size = { width: el.scrollWidth, height: el.scrollHeight }
    el.scrollLeft = el.scrollWidth; el.scrollTop = el.scrollHeight
    return size
  })
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
  const after = await page.locator('.sheet-scroll').evaluate(async el => {
    for (let step = 0; step < 4; step++) {
      await new Promise(requestAnimationFrame)
      el.scrollLeft = el.scrollWidth; el.scrollTop = el.scrollHeight
    }
    return { width: el.scrollWidth, height: el.scrollHeight }
  })
  expect(after).toEqual(before)
})
