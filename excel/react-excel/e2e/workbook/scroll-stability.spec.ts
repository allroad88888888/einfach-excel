import { expect, test } from '@playwright/test'

for (const axis of ['vertical', 'horizontal', 'diagonal'] as const) {
  test(`${axis} scroll reuses buffered cells at their actual sheet coordinates`, async ({ page }) => {
    await page.goto('/')
    const gridLocator = page.locator('[data-workbook-grid]')
    await expect(gridLocator).toHaveAttribute('data-projection-retained', 'false')
    await expect(page.locator('[data-cell="10:6"]')).toBeVisible()

    const samples = await page.evaluate(async (direction) => {
      const scroll = document.querySelector<HTMLElement>('.sheet-scroll')!
      const grid = document.querySelector<HTMLElement>('[data-workbook-grid]')!
      const read = () => {
        const rect = document.querySelector('[data-cell="10:6"]')!.getBoundingClientRect()
        return {
          x: rect.x + scroll.scrollLeft,
          y: rect.y + scroll.scrollTop,
          retained: grid.dataset.projectionRetained,
        }
      }
      const frames = [read()]
      // Observe intermediate commits as well as every animation frame.
      const observer = new MutationObserver(() => frames.push(read()))
      observer.observe(grid, { attributes: true, attributeFilter: ['style', 'data-projection-retained'] })
      try {
        scroll.scrollTop = direction === 'horizontal' ? 0 : 28
        scroll.scrollLeft = direction === 'vertical' ? 0 : 120
        for (let frame = 0; frame < 30; frame += 1) {
          await new Promise(requestAnimationFrame)
          frames.push(read())
        }
        return frames
      } finally {
        observer.disconnect()
      }
    }, axis)

    expect(samples.every((sample) => sample.retained === 'false')).toBe(true)
    expect(samples.at(-1)?.retained).toBe('false')
    for (const sample of samples) {
      expect(sample.x).toBeCloseTo(samples[0]!.x, 1)
      expect(sample.y).toBeCloseTo(samples[0]!.y, 1)
    }
    await expect(page.getByText('Loading visible cells…')).toHaveCount(0)
  })
}
