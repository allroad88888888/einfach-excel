import { expect, test } from '@playwright/test'

// DOM tracing/profiling itself scans thousands of nodes and distorts scroll latency.
test.use({ viewport: { width: 1920, height: 1080 }, trace: 'off' })

test('rapid wheel scrolling keeps the populated viewport covered in both directions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?demo=sales-orders')
  await expect(page.locator('[data-cell="10:6"]')).toBeVisible({ timeout: 20000 })
  const pane = page.locator('.sheet-scroll')
  const bounds = (await pane.boundingBox())!
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  const coverage = page.evaluate(async () => {
    const scroll = document.querySelector<HTMLElement>('.sheet-scroll')!
    const gaps: { top: number; gap: number; retained: string | undefined }[] = []
    let farthest = 0
    for (let frame = 0; frame < 600; frame++) {
      await new Promise(requestAnimationFrame)
      const table = document.querySelector('[data-workbook-grid] .spreadsheet-grid')!
      const box = table.getBoundingClientRect(), viewport = scroll.getBoundingClientRect()
      const gap = Math.max(0, box.top - (viewport.top + 29)) +
        Math.max(0, viewport.top + scroll.clientHeight - 2 - box.bottom)
      farthest = Math.max(farthest, scroll.scrollTop)
      if (gap > 1) gaps.push({ top: scroll.scrollTop, gap,
        retained: document.querySelector<HTMLElement>('[data-workbook-grid]')!.dataset.projectionRetained })
      if (scroll.dataset.coverageDone) break
    }
    return { gaps, farthest, finalTop: scroll.scrollTop }
  })
  for (const [steps, delta] of [[50, 180], [30, -180]]) {
    const inputs: Promise<void>[] = []
    for (let step = 0; step < steps!; step++) {
      inputs.push(page.mouse.wheel(0, delta!))
      await new Promise(resolve => setTimeout(resolve, 16))
    }
    await Promise.all(inputs)
  }
  await expect.poll(() => pane.evaluate(el => el.scrollTop)).toBeLessThan(5000)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
  await pane.evaluate(el => { (el as HTMLElement).dataset.coverageDone = 'true' })
  const result = await coverage
  expect(errors).toEqual([])
  expect(result.farthest).toBeGreaterThan(8000)
  expect(result.finalTop).toBeLessThan(result.farthest - 4000)
  expect(result.gaps).toEqual([])
})
