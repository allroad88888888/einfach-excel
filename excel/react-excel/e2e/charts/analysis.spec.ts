import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { button, frame, openWorkbook, settings, trackECharts } from './chart-support'

test.use({ viewport: { width: 1440, height: 1500 } })

const TITLE = 'Monthly revenue by region (k)'

async function openSettings(page: Page) {
  await frame(page, 'chart-revenue').dblclick({ position: { x: 280, y: 150 } })
  await expect(settings(page)).toBeVisible()
}

test('a series trendline and chart error bars are drawn and undo', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).title).toBe(TITLE)
  await openSettings(page)
  const types = async () => (await option('chart-revenue')).series.map((s) => s.type)
  const before = (await types()).length

  const trendlines = settings(page).getByRole('group', { name: 'Trendlines' })
  await trendlines.getByLabel('Trendline').first().selectOption('linear')
  await expect.poll(async () => (await option('chart-revenue')).series.at(-1)?.name)
    .toMatch(/^Linear \(.+\)$/)
  // 勾选写回 Rust 后才变成已勾选，所以点击后等待，而不是要求立即生效。
  await trendlines.getByLabel('Display equation').first().click()
  await expect(trendlines.getByLabel('Display equation').first()).toBeChecked()

  await settings(page).getByLabel('Error bars').selectOption('fixed')
  await expect.poll(async () => (await types()).filter((type) => type === 'custom').length)
    .toBe(before)
  await expect(settings(page).getByLabel('Error amount')).toHaveValue('1')

  await button(page, 'Undo').click()
  await expect.poll(async () => (await types()).includes('custom')).toBe(false)
  await expect(settings(page).getByLabel('Error bars')).toHaveValue('none')
  await button(page, 'Undo').click()
  await button(page, 'Undo').click()
  await expect.poll(types).toHaveLength(before)
})

test('a quick layout and a colour scheme restyle the chart', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?demo=charts')
  await expect.poll(async () => (await option('chart-revenue')).title).toBe(TITLE)
  await openSettings(page)
  const office = (await option('chart-revenue')).colors

  // 布局 4 去掉标题、图例放到底部并打开数据标签；下拉框选完回到占位项。
  await settings(page).getByLabel('Quick layout').selectOption('layout4')
  await expect.poll(async () => (await option('chart-revenue')).title).toBe('')
  await expect(settings(page).getByLabel('Legend')).toHaveValue('bottom')
  await expect(settings(page).getByLabel('Data labels')).toBeChecked()
  await expect(settings(page).getByLabel('Quick layout')).toHaveValue('')

  await settings(page).getByLabel('Change colors').selectOption('green')
  await expect.poll(async () => (await option('chart-revenue')).colors[0]).toBe('#70ad47')
  await button(page, 'Undo').click()
  await expect.poll(async () => (await option('chart-revenue')).colors).toEqual(office)
})

test('the chart downloads as an SVG drawn in the browser', async ({ page }) => {
  await openWorkbook(page, '?demo=charts')
  await openSettings(page)
  const download = page.waitForEvent('download')
  await settings(page).getByRole('button', { name: 'Download SVG', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe(`${TITLE}.svg`)
  const svg = await readFile((await file.path())!, 'utf8')
  expect(svg).toMatch(/^<svg[\s>]/)
  // 文字保持为矢量文本，导出的就是屏幕上的同一份配置。
  expect(svg).toContain(TITLE)
  await expect(settings(page).getByRole('status')).toHaveText('SVG downloaded.')
})
