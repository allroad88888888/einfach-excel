import { expect, test, type Page } from '@playwright/test'
import { button, cell, frame, frames, insertChart, openWorkbook, selectBy, settings,
  trackECharts } from './chart-support'

test.use({ viewport: { width: 1440, height: 1200 } })

const highlights = (page: Page) => page.locator('[data-host-highlight^="plugin.chart:"]')
const highlightIds = (page: Page) => highlights(page).evaluateAll((items) =>
  items.map((item) => item.getAttribute('data-host-highlight')))

async function createTable(page: Page, name: string) {
  await button(page, 'Tables').click()
  const dialog = page.getByRole('dialog', { name: 'Tables', exact: true })
  await dialog.getByLabel('Table name', { exact: true }).fill(name)
  await button(page, 'Create table').click()
  await expect(dialog).toHaveCount(0)
}

test('a chart made from a table follows the table as it grows and accepts names', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await selectBy(page, '2:0', '14:4')
  await createTable(page, 'Revenue')
  await selectBy(page, '2:0', '14:4')
  await insertChart(page, 'line')
  await expect(frames(page)).toHaveCount(6)
  const id = (await frames(page).last().getAttribute('data-drawing-id'))!
  await expect.poll(async () => (await option(id)).categories).toHaveLength(12)

  // 紧挨表格下方输入，表格自动扩一行，图表跟着多一个类别。
  await cell(page, '15:0').click()
  await page.keyboard.type('Next')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await option(id)).categories.at(-1)).toBe('Next')

  await frame(page, id).dblclick({ position: { x: 200, y: 100 } })
  const range = settings(page).getByLabel('Data range')
  await expect(range).toHaveValue('Revenue')
  await range.fill('Revenue[[Month]:[South]]')
  await range.press('Enter')
  await expect.poll(async () => (await option(id)).series.map((s) => s.name))
    .toEqual(['North', 'South'])
  await range.fill('Missing')
  await range.press('Enter')
  await expect(settings(page).getByRole('alert'))
    .toHaveText('The chart data table or name does not exist.')
})

test('selecting a chart outlines its data and clicking a bar marks its cell', async ({ page }) => {
  let core = ''
  page.on('request', (request) => {
    if (/echarts_core\.js/.test(request.url())) core = request.url()
  })
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).series).toHaveLength(4)
  await frame(page, 'chart-revenue').click({ position: { x: 4, y: 4 } })
  await expect.poll(() => highlightIds(page)).toEqual(
    ['plugin.chart:names:0', 'plugin.chart:categories:0', 'plugin.chart:values:0'])
  // 同 Excel：系列名红、类别紫、数值蓝，各自框住对应单元格。
  const names = await highlights(page).first().boundingBox()
  const header = await cell(page, '2:1').boundingBox()
  expect(Math.round(names!.y)).toBe(Math.round(header!.y))

  // 4 月 West 的柱子（第 4 个系列、第 4 个类别）对应 E7。
  const point = await page.evaluate(async (url) => {
    const host = document.querySelector(
      '.drawing-frame[data-drawing-id="chart-revenue"] .plugin-chart-canvas') as HTMLElement
    const { getInstanceByDom } = await import(/* @vite-ignore */ url)
    // 簇状柱各自偏离类别中心：取这根柱子自己的布局矩形中心。
    const bar = getInstanceByDom(host).getModel().getSeriesByIndex(3).getData()
      .getItemLayout(3) as { x: number; y: number; width: number; height: number }
    const box = host.getBoundingClientRect()
    return { x: box.x + bar.x + bar.width / 2, y: box.y + bar.y + bar.height / 2 }
  }, core)
  await page.mouse.move(point.x, point.y - 20)
  await page.mouse.move(point.x, point.y)
  await page.mouse.click(point.x, point.y)
  const marked = page.locator('[data-host-highlight="plugin.chart:point:0"]')
  await expect(marked).toBeVisible()
  const target = await cell(page, '6:4').boundingBox()
  const box = await marked.boundingBox()
  expect([Math.round(box!.x), Math.round(box!.y)]).toEqual(
    [Math.round(target!.x), Math.round(target!.y)])

  // 点格子取消选中图表，高亮随之撤掉。
  await cell(page, '3:6').click()
  await expect(highlights(page)).toHaveCount(0)
})
