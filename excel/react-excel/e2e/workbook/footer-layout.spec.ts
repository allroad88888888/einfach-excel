import { expect, test } from '@playwright/test'

for (const [width, locale] of [[1700, 'en'], [1700, 'zh-CN'], [1280, 'en'], [390, 'en']] as const) {
  test(`sheet tabs and status controls share a continuous aligned footer at ${width}px ${locale}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/?locale=${locale}`)
    const summary = page.getByRole('tab', { name: 'Summary', exact: true })
    await summary.click()
    await expect(summary).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('td[data-cell="0:1"]')).toHaveText('79')
    await expect(page.locator('.selection-statistic')).toHaveCount(6)
    const footer = page.locator('.workbook-footer')
    const before = (await footer.boundingBox())!
    const bounds = await footer.evaluate((element) => {
      const rect = (selector: string) => {
        const node = element.querySelector(selector)!
        const { x, y, width, height } = node.getBoundingClientRect()
        return { x, y, width, height, background: getComputedStyle(node).backgroundColor }
      }
      return {
        tabs: rect('.sheet-tabs'), controls: rect('.workbook-sheet-controls'),
        status: rect('.status-items'), zoom: rect('.zoom-control'),
        background: getComputedStyle(element).backgroundColor,
        fits: element.scrollWidth <= element.clientWidth,
      }
    })
    expect(bounds.controls.background).toBe(bounds.background)
    expect(bounds.status.background).toBe(bounds.background)
    expect(bounds.fits).toBe(true)
    if (width === 1700) {
      // One continuous row: no bottom strip below the tabs or vertical jump at the status area.
      expect(bounds.tabs.y).toBe(bounds.status.y)
      expect(bounds.tabs.height).toBe(bounds.status.height)
      expect(bounds.zoom.y).toBe(bounds.tabs.y)
      expect(bounds.zoom.height).toBe(bounds.tabs.height)
      expect(bounds.tabs.y + bounds.tabs.height).toBeCloseTo(before.y + before.height, 0)
      await expect(page.locator('.zoom-slider')).toHaveCSS('accent-color', await summary.evaluate(
        (element) => getComputedStyle(element).color,
      ))
    } else {
      expect(bounds.status.y).toBeCloseTo(bounds.tabs.y + bounds.tabs.height, 0)
      expect(bounds.controls.width).toBe(bounds.status.width)
    }
    if (width > 760) {
      await page.locator('.zoom-slider').focus()
      await page.locator('.zoom-slider').press('ArrowRight')
      await expect(page.locator('.zoom-percent')).toHaveText('110%')
    }
    await page.locator('.zoom-percent').click()
    await expect(page.locator('.zoom-percent')).toHaveText('100%')
    await expect(page.locator('td[data-cell="0:1"]')).toHaveText('79')
    expect((await footer.boundingBox())!.height).toBe(before.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`footer-${width}-${locale}.png`) })
    expect(errors).toEqual([])
  })
}
