import { expect, test } from '@playwright/test'
import { openDateFile, downloadDateFile } from '../support/conditional-dates'
import { launch, go, open, choose, apply, cell, button } from '../support/date-filter'

for (const width of [1280, 390]) test(`Table date filter excludes totals and preserves its native snapshot at ${width}px`, async ({ page }) => {
  await launch(page, width); await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  for (const [address, coord, formula] of [
    ['B81', '80:1', '=TODAY()-1'], ['B82', '81:1', '=TODAY()+0.75'], ['B83', '82:1', '=TODAY()+1'],
  ]) {
    await go(page, address); await cell(page, coord).dblclick()
    const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
    await editor.fill(formula); await editor.press('Enter')
  }
  await go(page, 'B80'); await open(page, 'B', 'DemoTable'); await choose(page); await apply(page)
  await expect(cell(page, '80:1')).toHaveCount(0)
  await expect(cell(page, '82:1')).toHaveCount(0)
  await expect(cell(page, '81:1')).toBeVisible()
  await expect(cell(page, '83:1')).toHaveText(await cell(page, '81:1').innerText())
  const bytes = await downloadDateFile(page)
  const saved = JSON.parse(bytes.toString()).workbook.tables.find((t: { name: string }) => t.name === 'DemoTable').autoFilter
  expect(saved.rules).toEqual([{ kind: 'date-period', colIndex: 1, period: 'today' }])
  expect(saved.hiddenRows).toEqual([80, 82])
  await button(page, 'Undo').click(); await expect(cell(page, '80:1')).toBeVisible()
  await button(page, 'Redo').click(); await expect(cell(page, '80:1')).toHaveCount(0)
  await openDateFile(page, bytes)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click(); await go(page, 'B80')
  await expect(cell(page, '80:1')).toHaveCount(0)
  await expect(cell(page, '83:1')).toBeVisible()
  await open(page, 'B', 'DemoTable')
  await expect(page.getByLabel('Date period 1', { exact: true })).toHaveValue('today')
})
