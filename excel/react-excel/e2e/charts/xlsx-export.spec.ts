import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { frames, openWorkbook } from './chart-support'

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)),
  '../../../rust/xlsx/tests/fixtures/charts.xlsx')
const files = (page: Page) => page.getByRole('dialog', { name: 'Workbook files' })
const status = (page: Page) => page.getByRole('status', { name: 'Workbook file status' })

async function openXlsx(page: Page, name: string, buffer: Buffer) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({ name, mimeType: XLSX, buffer })
}

test('downloading the charts demo as Excel and opening it again keeps every chart', async ({ page }) => {
  await openWorkbook(page, '?demo=charts')
  await expect(frames(page)).toHaveCount(5)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  const download = page.waitForEvent('download')
  await files(page).getByRole('button', { name: 'Download as Excel (.xlsx)' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/\.xlsx$/)
  // 五张图表都是可写出的类型：导出报告里没有 charts。
  await expect(files(page).getByRole('status')).toContainText('Download requested')
  await expect(files(page).getByRole('status')).not.toContainText('charts')
  await page.keyboard.press('Escape')

  await openXlsx(page, 'charts-demo.xlsx', await readFile((await file.path())!))
  await expect(frames(page)).toHaveCount(5)
  await expect(frames(page).locator('.plugin-chart-canvas')).toHaveCount(5)
  // 导入时没有跳过任何内容，状态栏不出现。
  await expect(status(page)).toBeHidden()
})

test('opening an Excel file with charts shows them and reports the ones it skipped', async ({ page }) => {
  await openWorkbook(page, '?plugins=chart')
  await openXlsx(page, 'charts.xlsx', await readFile(fixture))
  await expect(page.getByRole('tab', { name: 'Main', exact: true })).toBeVisible()
  await expect(frames(page)).toHaveCount(6)
  await expect(frames(page).first().locator('.plugin-chart-canvas')).toBeVisible()
  // 雷达、字面量数据、外部引用的图表跳过并提示；图片照旧提示。
  await expect(status(page)).toContainText('Opened Excel workbook. Skipped:')
  await expect(status(page)).toContainText('charts')
  await page.getByRole('tab', { name: 'Shapes', exact: true }).click()
  await expect(frames(page)).toHaveCount(7)
})
