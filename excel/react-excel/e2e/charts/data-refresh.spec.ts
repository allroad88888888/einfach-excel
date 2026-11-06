import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { box, button, cell, frame, openWorkbook, settings, trackECharts } from './chart-support'

test.use({ viewport: { width: 1440, height: 1500 } })

const rowMenu = (page: Page) =>
  page.getByRole('combobox', { name: 'Insert or delete rows and columns' })
const visibilityMenu = (page: Page) =>
  page.getByRole('combobox', { name: 'Row and column visibility' })

async function typeInto(page: Page, coord: string, text: string) {
  await cell(page, coord).click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

test('editing a data cell refreshes the chart, including one driven by formulas, and undo reverts it', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).series[0]?.values[0]).toBe(120)
  // 季度汇总 G12 = SUM(B4:B6)：120 + 140 + 157。
  await expect.poll(async () => (await option('chart-quarters')).series[0]?.values[0]).toBe(417)

  await typeInto(page, '3:1', '500')
  await expect(cell(page, '3:1')).toHaveText('500')
  await expect.poll(async () => (await option('chart-revenue')).series[0]?.values[0]).toBe(500)
  await expect.poll(async () => (await option('chart-quarters')).series[0]?.values[0]).toBe(797)
  // 其他系列与类别不受影响。
  expect((await option('chart-revenue')).series[1]?.values[0]).toBe(152)

  await button(page, 'Undo').click()
  await expect(cell(page, '3:1')).toHaveText('120')
  await expect.poll(async () => (await option('chart-revenue')).series[0]?.values[0]).toBe(120)
  await expect.poll(async () => (await option('chart-quarters')).series[0]?.values[0]).toBe(417)
})

test('inserting a row above a chart moves its anchor and its data reference down together', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect(frame(page, 'chart-revenue').locator('canvas')).toBeVisible()
  const before = await box(frame(page, 'chart-revenue'))
  const rowBefore = await box(cell(page, '16:0'))
  expect(Math.abs(before.y - rowBefore.y)).toBeLessThan(2)

  await select(page, 'A2', '1:0')
  await rowMenu(page).selectOption('insert-rows')
  await expect(cell(page, '3:0')).toHaveText('Month')

  // 图表仍贴着原来的锚点单元格（现在是 A18），即整体下移了一行。
  await expect.poll(async () =>
    Math.abs((await box(frame(page, 'chart-revenue'))).y - (await box(cell(page, '17:0'))).y))
    .toBeLessThan(2)
  expect((await box(frame(page, 'chart-revenue'))).y).toBeGreaterThan(before.y)

  // 数据引用随之平移：仍然画同一批数字，设置栏显示新的区域。
  expect((await option('chart-revenue')).series[0]?.values.slice(0, 3)).toEqual([120, 140, 157])
  await frame(page, 'chart-revenue').dblclick({ position: { x: 280, y: 150 } })
  await expect(settings(page).getByLabel('Data range')).toHaveValue('A4:E16')

  await button(page, 'Undo').click()
  await expect(cell(page, '2:0')).toHaveText('Month')
  await expect.poll(async () =>
    Math.abs((await box(frame(page, 'chart-revenue'))).y - (await box(cell(page, '16:0'))).y))
    .toBeLessThan(2)
})

test('hiding a data row drops that point from the chart and undo draws it again', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).categories.length).toBe(12)
  expect((await option('chart-revenue')).categories[1]).toBe('Feb')

  await select(page, 'A5', '4:0')
  await expect(cell(page, '4:0')).toHaveText('Feb')
  await visibilityMenu(page).selectOption('hide-rows')
  await expect(cell(page, '4:0')).toHaveCount(0)
  await expect.poll(async () => (await option('chart-revenue')).categories.length).toBe(11)
  const hidden = await option('chart-revenue')
  expect(hidden.categories).not.toContain('Feb')
  expect(hidden.series[0]?.values).toEqual([120, 157, 168, 171, 168, 160, 151, 145, 145, 151, 165])

  await button(page, 'Undo').click()
  await expect(cell(page, '4:0')).toHaveText('Feb')
  await expect.poll(async () => (await option('chart-revenue')).categories.length).toBe(12)
  expect((await option('chart-revenue')).categories[1]).toBe('Feb')
})
