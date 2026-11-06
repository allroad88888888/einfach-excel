import { expect, test } from '@playwright/test'
import { frames, openWorkbook } from './chart-support'

test('downloading a workbook with charts as Excel reports the charts as not exported', async ({ page }) => {
  await openWorkbook(page, '?demo=charts')
  await expect(frames(page)).toHaveCount(5)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  const files = page.getByRole('dialog', { name: 'Workbook files' })
  const download = page.waitForEvent('download')
  await files.getByRole('button', { name: 'Download as Excel (.xlsx)' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/)
  // 图表尚不写入 XLSX：明确告诉用户，而不是静默丢失。
  await expect(files.getByRole('status'))
    .toContainText('Download requested. Not exported to Excel: charts')
  // 工作簿里的图表不受导出影响。
  await expect(frames(page)).toHaveCount(5)
})
