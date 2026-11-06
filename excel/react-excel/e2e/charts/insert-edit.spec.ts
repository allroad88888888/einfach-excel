import { expect, test } from '@playwright/test'
import { box, button, cell, frames, insertChart, openWorkbook, selectBy, trackECharts } from './chart-support'

test('inserting a column chart from the selection places it beside the data and is undoable', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?plugins=chart')
  await selectBy(page, '0:3', '5:4')
  await expect(frames(page)).toHaveCount(0)
  await insertChart(page, 'column')

  await expect(frames(page)).toHaveCount(1)
  const chart = frames(page).first()
  await expect(chart).toHaveAttribute('data-selected', 'true')
  // 锚点在选区右侧留一列空隙（G1），图表左边不早于数据区右边。
  const anchor = await box(cell(page, '0:6'))
  const frameBox = await box(chart)
  expect(Math.abs(frameBox.x - anchor.x)).toBeLessThan(2)
  expect(Math.abs(frameBox.y - anchor.y)).toBeLessThan(2)
  expect((await box(cell(page, '0:4'))).x + (await box(cell(page, '0:4'))).width)
    .toBeLessThanOrEqual(frameBox.x)

  const id = (await chart.getAttribute('data-drawing-id'))!
  await expect.poll(async () => (await option(id)).series.map((s) => [s.type, s.name, s.values]))
    .toEqual([['bar', 'Quantity', [1, 2, 3, 4, 5]]])
  expect((await option(id)).categories).toEqual(['Keyboard', 'Monitor', 'Dock', 'Headset', 'Webcam'])

  await button(page, 'Undo').click()
  await expect(frames(page)).toHaveCount(0)
  await button(page, 'Redo').click()
  await expect(frames(page)).toHaveCount(1)
  await expect.poll(async () => (await option(id)).series[0]?.values).toEqual([1, 2, 3, 4, 5])
})

test('the recommended chart button picks a chart type that fits the selected data', async ({ page }) => {
  const option = trackECharts(page)
  await openWorkbook(page, '?plugins=chart')
  await selectBy(page, '0:3', '5:4')
  await insertChart(page, 'recommended')

  await expect(frames(page)).toHaveCount(1)
  const id = (await frames(page).first().getAttribute('data-drawing-id'))!
  // 单系列、5 个全为正的类别：按推荐规则是饼图，而不是默认柱形。
  await expect.poll(async () => (await option(id)).series.map((s) => [s.type, s.values]))
    .toEqual([['pie', [1, 2, 3, 4, 5]]])
  await button(page, 'Undo').click()
  await expect(frames(page)).toHaveCount(0)
})
