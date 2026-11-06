import { expect, test, type Page } from '@playwright/test'
import { button, frames, openInsertTab, openWorkbook, selectBy, trackECharts } from './chart-support'

async function insertMore(page: Page, type: string) {
  await openInsertTab(page)
  await page.locator('[data-chart-type="more"]').click()
  const menu = page.getByRole('menu', { name: 'More charts' })
  await menu.locator(`[data-chart-type="${type}"]`).click()
  await expect(menu).toBeHidden()
}

// 默认工作簿：C 区域、D 产品、E 数量、F 单价、G 金额，第 1 行是表头。
const CASES = [
  { type: 'radar', from: '0:3', to: '5:5', series: 'radar' },
  { type: 'funnel', from: '0:3', to: '5:4', series: 'funnel' },
  { type: 'waterfall', from: '0:3', to: '5:4', series: 'bar' },
  { type: 'histogram', from: '0:4', to: '10:4', series: 'bar' },
  { type: 'boxplot', from: '0:4', to: '10:5', series: 'boxplot' },
  { type: 'treemap', from: '0:2', to: '10:4', series: 'treemap' },
  { type: 'sunburst', from: '0:2', to: '10:4', series: 'sunburst' },
] as const

test('the More charts menu inserts each extra chart type from the selection', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?plugins=chart')
  for (const { type, from, to, series } of CASES) {
    await selectBy(page, from, to)
    await insertMore(page, type)
    await expect(frames(page)).toHaveCount(1)
    const id = (await frames(page).first().getAttribute('data-drawing-id'))!
    await expect.poll(async () => (await option(id)).series[0]?.type, { message: type })
      .toBe(series)
    await button(page, 'Undo').click()
    await expect(frames(page)).toHaveCount(0)
  }

  // 股价图要恰好四个数值系列；三列数值时显示错误，不硬画。
  await selectBy(page, '0:3', '5:6')
  await insertMore(page, 'stock')
  await expect(frames(page).first())
    .toContainText('A stock chart needs exactly four number series: open, high, low, close.')
})
