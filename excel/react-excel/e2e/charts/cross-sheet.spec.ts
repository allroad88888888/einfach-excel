import { expect, test, type Page } from '@playwright/test'
import { frames, settings } from './chart-support'

async function start(page: Page) {
  await page.goto('/e2e/fixtures/chart-api/index.html')
  await expect(page.locator('.workbook[data-runtime-state="ready"]')).toBeVisible()
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('Main')
}
const run = <T>(page: Page, body: string) =>
  page.evaluate(`(async () => { const { workbook, charts } = window; ${body} })()`) as Promise<T>
const dataOf = async (page: Page) =>
  (await run<{ chart: { data: string } }>(page, "return charts.get('main', 'chart-1')")).chart.data

test('a chart on one sheet follows row edits, deletion and undo of its data sheet', async ({ page }) => {
  await start(page)
  expect(await run(page,
    "return charts.insert({ sheetId: 'main', data: 'Data!A1:B4', type: 'column' })"))
    .toMatchObject({ status: 'ok', chart: { data: 'Data!A1:B4' } })
  await expect(frames(page)).toHaveCount(1)
  await expect(frames(page).first().locator('.plugin-chart-canvas')).toBeVisible()

  // 数据表上方插两行：Main 上的图表引用一起下移，撤销复原。
  await run(page, "return workbook.structure({ sheetId: 'data', edit: { action: 'insert-rows', at: 0, count: 2 } })")
  await expect.poll(() => dataOf(page)).toBe('Data!A3:B6')
  await run(page, 'return workbook.undo()')
  await expect.poll(() => dataOf(page)).toBe('Data!A1:B4')

  // 改名只改显示的表名；删表显示 #REF!，撤销删表后图表恢复。
  await run(page, "return workbook.renameSheet({ sheetId: 'data', name: 'Sales data' })")
  await expect.poll(() => dataOf(page)).toBe("'Sales data'!A1:B4")
  await run(page, "return workbook.deleteSheet({ sheetId: 'data' })")
  await expect(frames(page).first()).toContainText('The chart data worksheet was deleted.')
  await run(page, 'return workbook.undo()')
  await expect(frames(page).first().locator('.plugin-chart-canvas')).toBeVisible()
  await expect.poll(() => dataOf(page)).toBe("'Sales data'!A1:B4")

  // 设置栏里用表名显示与改写区域。
  await frames(page).first().dblclick()
  const range = settings(page).getByLabel('Data range')
  await expect(range).toHaveValue("'Sales data'!A1:B4")
  await range.fill("'Sales data'!A1:B3")
  await range.press('Enter')
  await expect.poll(() => dataOf(page)).toBe("'Sales data'!A1:B3")

  // 文件里按表名保存：导出再打开（打开后表 id 会重新分配），引用仍指向那张表。
  expect(await run(page, `const file = await workbook.exportSnapshot()
    return workbook.openSnapshot(file.snapshot)`)).toEqual({ status: 'ok' })
  await expect.poll(async () => (await run<{ charts: { data: string }[] }>(page,
    'return charts.list()')).charts.map((chart) => chart.data)).toEqual(["'Sales data'!A1:B3"])
  await expect(frames(page).first().locator('.plugin-chart-canvas')).toBeVisible()
})
