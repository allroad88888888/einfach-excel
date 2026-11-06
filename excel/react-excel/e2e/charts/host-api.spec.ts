import { expect, test, type Page } from '@playwright/test'
import { frames } from './chart-support'

async function start(page: Page) {
  await page.goto('/e2e/fixtures/chart-api/index.html')
  await expect(page.locator('.workbook[data-runtime-state="ready"]')).toBeVisible()
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('Main')
}
const run = <T>(page: Page, body: string) =>
  page.evaluate(`(async () => { const { workbook, charts, chartEvents } = window; ${body} })()`) as
    Promise<T>
const events = (page: Page) =>
  run<{ type: string; sheetId: string; id: string; title?: string }[]>(page,
    'return chartEvents.map((e) => ({ type: e.type, sheetId: e.sheetId, id: e.id, title: e.chart?.spec.title }))')

test('host inserts, edits and removes a chart on another sheet with change events', async ({ page }) => {
  await start(page)
  const inserted = await run<{ status: string; chart: { id: string; data: string; spec: { type: string } } }>(page,
    "return charts.insert({ sheetId: 'data', data: 'A1:B4', spec: { title: 'Sales' } })")
  // 推荐规则：单系列正值 → 饼图；按数据猜出首行是表头。
  expect(inserted).toMatchObject({ status: 'ok', chart: { id: 'chart-1', data: 'A1:B4',
    spec: { type: 'pie', title: 'Sales', headerRow: true } } })
  await expect.poll(() => events(page)).toEqual([
    { type: 'insert', sheetId: 'data', id: 'chart-1', title: 'Sales' }])
  // 写在非当前表：当前表没有图表，切过去才看到。
  await expect(frames(page)).toHaveCount(0)
  await run(page, "workbook.activateSheet('data')")
  await expect(frames(page)).toHaveCount(1)

  expect(await run(page, "return charts.update('data', 'chart-1', { spec: { type: 'column', title: 'Q1' } })"))
    .toMatchObject({ status: 'ok', chart: { spec: { type: 'column', title: 'Q1' } } })
  await expect.poll(async () => (await events(page)).at(-1))
    .toEqual({ type: 'update', sheetId: 'data', id: 'chart-1', title: 'Q1' })
  // 宿主写入与用户操作共用撤销记录。
  await run(page, 'return workbook.undo()')
  await expect.poll(async () => (await events(page)).at(-1))
    .toEqual({ type: 'update', sheetId: 'data', id: 'chart-1', title: 'Sales' })

  expect(await run(page, "return charts.list()")).toMatchObject({ status: 'ok',
    charts: [{ id: 'chart-1', sheetId: 'data', spec: { title: 'Sales' } }] })
  expect(await run(page, "return charts.remove('data', 'chart-1')")).toEqual({ status: 'ok' })
  await expect(frames(page)).toHaveCount(0)
  await expect.poll(async () => (await events(page)).at(-1))
    .toEqual({ type: 'remove', sheetId: 'data', id: 'chart-1' })
})

test('host chart writes respect beforeChange and report invalid input', async ({ page }) => {
  await start(page)
  expect(await run(page, "return charts.insert({ sheetId: 'data', data: 'nope' })"))
    .toMatchObject({ status: 'error', error: { code: 'INVALID_RANGE' } })
  await run(page, 'workbook.hooks({ beforeChange: () => false })')
  expect(await run(page, "return charts.insert({ sheetId: 'data', data: 'A1:B4' })"))
    .toMatchObject({ status: 'error' })
  await run(page, 'workbook.hooks({})')
  expect(await run(page, "return charts.list('data')")).toEqual({ status: 'ok', charts: [] })
  expect(await run(page, "return charts.insert({ sheetId: 'data', data: 'A1:B4', type: 'line' })"))
    .toMatchObject({ status: 'ok', chart: { spec: { type: 'line' } } })
})
