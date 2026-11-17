import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { openDateFile, downloadDateFile } from '../support/conditional-dates'
import { start, enable, open, rank, apply, visible, button, cell, dialog } from '../support/top-filter'

test('native rank filters reopen without the plugin and remain intact when editing another column', async ({ page }) => {
  await start(page); await enable(page); await open(page); await rank(page); await apply(page)
  const bytes = await downloadDateFile(page)
  const saved = JSON.parse(bytes.toString()).workbook
  expect(saved.filters.find((entry: { sheet: number }) => entry.sheet === 1).rules)
    .toEqual([{ kind: 'top', colIndex: 5, direction: 'top', unit: 'items', value: 2 }])
  await page.goto('/?locale=en'); await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, bytes)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await visible(page, [0, 1, 2]); await open(page)
  await expect(dialog(page).getByText('This saved condition is preserved. Enable its plugin to edit it.')).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Top / Bottom…' })).toHaveCount(0)
  await button(page, 'Apply filter').click()
  await visible(page, [0, 1, 2]); await open(page, 'E')
  await dialog(page).getByLabel('Filter condition 1', { exact: true }).selectOption('contains')
  await dialog(page).getByLabel('Filter value 1', { exact: true }).fill('Keep')
  await apply(page); await visible(page, [1, 2])
  const after = JSON.parse((await downloadDateFile(page)).toString()).workbook
  expect(after.filters.find((entry: { sheet: number }) => entry.sheet === 1).rules)
    .toContainEqual(saved.filters.find((entry: { sheet: number }) => entry.sheet === 1).rules[0])
})

test('Table rank native roundtrip preserves rule and committed hidden snapshot', async ({ page }) => {
  await start(page); await select(page, 'A80', '79:0')
  await open(page, 'B', 'DemoTable'); await rank(page, '1'); await apply(page)
  const bytes = await downloadDateFile(page)
  const saved = JSON.parse(bytes.toString()).workbook
  const filter = saved.tables.find((entry: { name: string }) => entry.name === 'DemoTable').autoFilter
  expect(filter.rules).toEqual([{ kind: 'top', colIndex: 1, direction: 'top', unit: 'items', value: 1 }])
  expect(filter.hiddenRows).toEqual([80, 81])
  await page.goto('/?plugins=data-filter&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001'); await openDateFile(page, bytes)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A80', '79:0')
  await expect(cell(page, '80:0')).toHaveCount(0)
  await expect(cell(page, '83:1')).toHaveText('30')
  await open(page, 'B', 'DemoTable')
  await expect(dialog(page).getByLabel('Rank amount 1', { exact: true })).toHaveValue('1')
})

test('XLSX reports lost filter conditions and snapshots while preserving manual hiding', async ({ page }) => {
  await start(page); await enable(page); await open(page); await rank(page); await apply(page)
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download as Excel (.xlsx)').click()
  const download = await pending
  await expect(page.getByRole('dialog', { name: 'Workbook files' }))
    .toContainText('filters and filtered-row snapshots (manual hiding preserved)')
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile((await download.path())!)
  await button(page, 'Close').click()
  await openDateFile(page, bytes, 'xlsx')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await visible(page, [0, 1, 2, 3, 4, 5, 6])
  await expect(cell(page, '9:0')).toHaveCount(0)
  const restored = JSON.parse((await downloadDateFile(page)).toString()).workbook
  expect(restored.filters ?? []).toEqual([])
  expect(restored.hidden.find((entry: { sheet: number }) => entry.sheet === 1).rows).toContain(9)
})
