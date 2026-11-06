import { expect, test } from '@playwright/test'
import { button, frame, openWorkbook, settings, trackECharts } from './chart-support'

test.use({ viewport: { width: 1440, height: 1500 } })

const TITLE = 'Monthly revenue by region (k)'

test('double-clicking a chart opens settings where title and type change and undo', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).title).toBe(TITLE)
  await frame(page, 'chart-revenue').dblclick({ position: { x: 280, y: 150 } })
  await expect(settings(page)).toBeVisible()
  await expect(settings(page).getByLabel('Chart title')).toHaveValue(TITLE)
  await expect(settings(page).getByLabel('Chart type')).toHaveValue('column')

  await settings(page).getByLabel('Chart title').fill('Revenue by region')
  await settings(page).getByLabel('Chart title').press('Enter')
  await expect.poll(async () => (await option('chart-revenue')).title).toBe('Revenue by region')

  await settings(page).getByLabel('Chart type').selectOption('line')
  await expect.poll(async () => (await option('chart-revenue')).series.map((s) => s.type))
    .toEqual(['line', 'line', 'line', 'line'])

  await button(page, 'Undo').click()
  await expect.poll(async () => (await option('chart-revenue')).series[0]?.type).toBe('bar')
  await expect(settings(page).getByLabel('Chart type')).toHaveValue('column')
  expect((await option('chart-revenue')).title).toBe('Revenue by region')
  await button(page, 'Undo').click()
  await expect.poll(async () => (await option('chart-revenue')).title).toBe(TITLE)
  await expect(settings(page).getByLabel('Chart title')).toHaveValue(TITLE)

  await settings(page).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(settings(page)).toHaveCount(0)
})

test('a multi-area data range charts the joined columns and misaligned areas report an error', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).series.length).toBe(4)
  await frame(page, 'chart-revenue').dblclick({ position: { x: 280, y: 150 } })
  const range = settings(page).getByLabel('Data range')
  await expect(range).toHaveValue('A3:E15')

  // 月份列 + South 列，两块同高的区域左右拼成一张数据表。
  await range.fill('A3:A15,C3:C15')
  await range.press('Enter')
  await expect.poll(async () => (await option('chart-revenue')).series.map((s) => s.name))
    .toEqual(['South'])
  const joined = await option('chart-revenue')
  expect(joined.categories).toHaveLength(12)
  expect(joined.categories[0]).toBe('Jan')
  expect(joined.series[0]?.values.slice(0, 3)).toEqual([152, 171, 184])
  await expect(settings(page).getByRole('alert')).toHaveCount(0)

  // 既不同高也不同宽：报错，图表保持上一次成功的数据。
  await range.fill('A3:A15,C3:D10')
  await settings(page).getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(settings(page).getByRole('alert'))
    .toHaveText('The chart areas must line up.')
  expect((await option('chart-revenue')).series.map((s) => s.name)).toEqual(['South'])

  await range.fill('A3:E15')
  await range.press('Enter')
  await expect(settings(page).getByRole('alert')).toHaveCount(0)
  await expect.poll(async () => (await option('chart-revenue')).series.length).toBe(4)
  await button(page, 'Undo').click()
  await expect.poll(async () => (await option('chart-revenue')).series.map((s) => s.name))
    .toEqual(['South'])
})
