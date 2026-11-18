import { expect, test } from '@playwright/test'
import { openDateFile, downloadDateFile } from '../support/conditional-dates'
import { showRibbonItem } from '../support/ribbon'
import { launch, boundaries, open, choose, apply, rows, button, cell, dialog, menu } from '../support/date-filter'

test('native date rules reopen without the plugin and survive another column edit and reapply', async ({ page }) => {
  await launch(page); await boundaries(page); await open(page); await choose(page); await apply(page)
  const bytes = await downloadDateFile(page)
  const saved = JSON.parse(bytes.toString()).workbook.filters[0]
  expect(saved.rules).toEqual([{ kind: 'date-period', colIndex: 1, period: 'today' }])
  expect(saved.hiddenRows).toEqual([1, 5, 6, 7, 8, 9, 10, 11])
  await page.goto('/?locale=en'); await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, bytes); await rows(page, [2, 3, 4]); await open(page)
  await expect(button(page, 'Date period…')).toHaveCount(0)
  await expect(dialog(page)).toContainText('This saved condition is preserved. Enable its plugin to edit it.')
  await apply(page); await open(page, 'A')
  await page.getByLabel('Filter condition 1', { exact: true }).selectOption('equals')
  await page.getByLabel('Filter value 1', { exact: true }).fill('R3')
  await apply(page); await rows(page, [3])
  await showRibbonItem(page, 'data.worksheet-filter'); await menu(page).selectOption('reapply')
  await rows(page, [3])
  const restored = JSON.parse((await downloadDateFile(page)).toString()).workbook.filters[0]
  expect(restored.rules).toContainEqual(saved.rules[0])
})

test('XLSX date-filter export reports lost conditions and reopens all filtered data rows', async ({ page }) => {
  await launch(page); await boundaries(page); await open(page); await choose(page); await apply(page)
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download as Excel (.xlsx)').click()
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile((await (await pending).path())!)
  await expect(page.getByRole('dialog', { name: 'Workbook files' }))
    .toContainText('filters and filtered-row snapshots (manual hiding preserved)')
  await button(page, 'Close').click(); await openDateFile(page, bytes, 'xlsx')
  await rows(page, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  expect(JSON.parse((await downloadDateFile(page)).toString()).workbook.filters ?? []).toEqual([])
})
