import { expect, test } from '@playwright/test'

for (const rate of [1, 4]) {
  test(`React rapid scroll keeps cells covering the viewport at CPU ${rate}x`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.goto('/')
    await expect(page.locator('[data-cell="10:6"]')).toBeVisible()
    const gaps = await page.evaluate(async () => {
      const scroll = document.querySelector<HTMLElement>('.sheet-scroll')!
      const missing: { frame: number; gap: number }[] = []
      for (let frame = 0; frame < 72; frame++) {
        scroll.scrollTop += frame < 36 ? 84 : -84
        await new Promise(requestAnimationFrame)
        const table = document.querySelector('[data-workbook-grid] .spreadsheet-grid')!
        const box = table.getBoundingClientRect(), viewport = scroll.getBoundingClientRect()
        const top = viewport.top + 29, bottom = viewport.top + scroll.clientHeight - 2
        const gap = Math.max(0, box.top - top) + Math.max(0, bottom - box.bottom)
        if (gap > 1) missing.push({ frame, gap })
      }
      return missing
    })
    expect(gaps).toEqual([])
  })
}
