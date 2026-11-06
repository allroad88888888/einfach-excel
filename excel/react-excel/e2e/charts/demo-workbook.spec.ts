import { expect, test } from '@playwright/test'
import { box, cell, frame, frames, openWorkbook, trackECharts } from './chart-support'

test.use({ viewport: { width: 1440, height: 1500 } })

test('the charts demo loads five charts that scroll together with the grid', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect(frames(page)).toHaveCount(5)
  await expect(frames(page).locator('canvas')).toHaveCount(5)
  const titles = ['chart-revenue', 'chart-trend', 'chart-products', 'chart-spend', 'chart-quarters']
  for (const id of titles) await expect(frame(page, id)).toBeVisible()
  await expect.poll(async () => Promise.all(titles.map(async (id) => (await option(id)).title)))
    .toEqual(['Monthly revenue by region (k)', 'Revenue trend', 'Units by product',
      'Ad spend vs revenue', 'Quarterly revenue (formulas)'])
  expect((await option('chart-products')).series.map((s) => s.type)).toEqual(['pie'])

  const chart = frame(page, 'chart-revenue')
  const anchor = cell(page, '16:0')
  const gapBefore = (await box(chart)).y - (await box(anchor)).y
  const yBefore = (await box(chart)).y
  await cell(page, '5:0').hover()
  await page.mouse.wheel(0, 140)
  await expect.poll(async () => yBefore - (await box(chart)).y).toBeGreaterThan(100)
  // 锚定单元格与图表同步移动：相对位置不变。
  const gapAfter = (await box(chart)).y - (await box(anchor)).y
  expect(Math.abs(gapAfter - gapBefore)).toBeLessThan(2)
  expect(Math.abs((await box(chart)).x - (await box(anchor)).x)).toBeLessThan(2)
  await expect(chart.locator('canvas')).toBeVisible()
})
