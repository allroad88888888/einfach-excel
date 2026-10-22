import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const artifacts = fileURLToPath(new URL(
  '../../../../.codex-artifacts/react-excel-package-002', import.meta.url,
))

for (const width of [1280, 390]) {
  for (const locale of ['en', 'zh'] as const) {
    test(`demo retains ${locale} layout and merged cells at ${width}px`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.setViewportSize({ width, height: 844 })
      await page.goto(`/?locale=${locale}`)
      await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
      await expect(page.locator('[data-merged-cell]').first()).toBeVisible()
      await expect(page.getByRole('combobox', { name: locale === 'en' ? 'Interface language' : '界面语言' })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await page.screenshot({ path: `${artifacts}/demo-${locale}-${width}.png` })
      expect(errors).toEqual([])
    })
  }
  test(`embedded English and Chinese fit their host sizes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/e2e/package-embedding/host.html')
    const first = page.locator('#first'), second = page.locator('#second')
    await expect(first.locator('td[data-cell="1:0"]')).toHaveText('Original')
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    await second.getByRole('combobox', { name: 'Interface language' }).selectOption('zh')
    for (const root of [first, second]) {
      expect(await root.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      const clipped = await root.locator('.ribbon-tab,.workbook-file-trigger').evaluateAll(nodes => nodes
        .filter(node => node.clientWidth > 0 && node.scrollWidth > node.clientWidth)
        .map(node => node.textContent))
      expect(clipped).toEqual([])
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    await page.screenshot({ path: `${artifacts}/embedded-${width}.png`, fullPage: true })
  })
}
