import { expect, test } from '@playwright/test'

for (const rate of [1, 4]) {
  test(`React rapid scroll keeps cells covering the viewport at CPU ${rate}x`, async ({ page }) => {
    // 节流后 72 帧滚动在慢 CI runner 上会逼近默认 30s 用例上限。
    test.slow(rate > 1)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.goto('/')
    // 首个投影要一次渲染 4 屏缓冲窗口；节流后的慢 CI runner 上首帧会超过默认 5s。
    // 这里只等启动就绪，本用例断言的是之后的滚动覆盖，不是首屏耗时。
    await expect(page.locator('[data-cell="10:6"]')).toBeVisible({ timeout: 20_000 })
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
