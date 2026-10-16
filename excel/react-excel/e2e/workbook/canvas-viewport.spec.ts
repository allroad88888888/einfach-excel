import { expect, test } from '@playwright/test'

test.use({ deviceScaleFactor: 2 })

test('bitmap stays bounded inside a 650-row merge with an offscreen anchor', async ({ page }) => {
  await page.goto('/?renderer=canvas')
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toBeVisible()
  await page.locator('.sheet-scroll').evaluate(el => {
    el.scrollTop = 800 * 28; el.scrollLeft = 84 * 120
  })
  await expect.poll(() => canvas.evaluate(node => {
    const el = node as HTMLCanvasElement
    const box = el.getBoundingClientRect()
    const scroll = el.closest('.sheet-scroll')!.getBoundingClientRect()
    const x = scroll.left + 75 - box.left, y = scroll.top + 100 - box.top
    return Array.from(el.getContext('2d')!.getImageData(x * 2, y * 2, 1, 1).data)
  })).toEqual([255, 242, 204, 255])
  const size = await canvas.evaluate(node => {
    const el = node as HTMLCanvasElement, scroll = el.closest('.sheet-scroll')!
    return { width: el.width, height: el.height, maxWidth: (scroll.clientWidth + 256) * 2,
      maxHeight: (scroll.clientHeight + 256) * 2, row: Number(el.dataset.rowStart) }
  })
  expect(size.width).toBeLessThanOrEqual(size.maxWidth)
  expect(size.height).toBeLessThanOrEqual(size.maxHeight)
  expect(size.row).toBeGreaterThan(340)
  const viewport = (await page.locator('.sheet-scroll').boundingBox())!
  await page.mouse.click(viewport.x + 75, viewport.y + 100)
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('CG341:CH990')
})

test('scrolling within the prefetched window does not rebuild the cell layout', async ({ page }) => {
  await page.goto('/?renderer=canvas')
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toHaveAttribute('data-cell-count', /[1-9]\d*/)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
  const samples = await canvas.evaluate(async node => {
    const el = node as HTMLElement, scroll = el.closest('.sheet-scroll')!
    const counts = [el.dataset.layoutBuilds]
    for (let frame = 0; frame < 12; frame++) {
      scroll.scrollTop += 7
      await new Promise(requestAnimationFrame)
      counts.push(el.dataset.layoutBuilds)
    }
    return counts
  })
  expect(new Set(samples).size).toBe(1)
})

test('one-row scrolling reuses most pixels and paints only the exposed strip', async ({ page }) => {
  await page.goto('/?renderer=canvas')
  const canvas = page.locator('[data-workbook-grid] canvas')
  await expect(canvas).toHaveAttribute('data-cell-count', /[1-9]\d*/)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
  const sample = await canvas.evaluate(async node => {
    const el = node as HTMLCanvasElement, scroll = el.closest('.sheet-scroll')!
    const full = Number(el.dataset.paintedCells)
    scroll.scrollTop += 28
    await new Promise(requestAnimationFrame)
    return { full, painted: Number(el.dataset.paintedCells),
      reused: Number(el.dataset.reusedPixels), total: el.width * el.height }
  })
  expect(sample.painted).toBeLessThan(sample.full / 2)
  expect(sample.reused).toBeGreaterThan(sample.total * 0.8)
})
