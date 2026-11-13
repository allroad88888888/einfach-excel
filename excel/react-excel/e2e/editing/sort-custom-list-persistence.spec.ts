import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { start, save, open, configure, apply, records, cell, button } from '../support/custom-list-sort'

for (const excel of [false, true]) test(`list-sorted records reopen without the plugin through ${excel ? 'xlsx' : 'native'} files`, async ({ page }) => {
  await start(page); await save(page); await open(page); await configure(page); await apply(page)
  const bytes = await downloadFile(page, excel)
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, bytes, excel ? 'xlsx' : 'einfach.json')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A25:C29', '24:0')
  await records(page, ['W20', 'W10', 'E10', 'E30'])
  await expect(cell(page, '25:2')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '27:2')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '28:2')).toHaveCSS('text-decoration-line', 'underline')
  await expect(cell(page, '24:0')).toHaveText('Team')
  await select(page, 'A26:C29', '25:0')
  await showRibbonItem(page, 'data.sort-selected-range')
  await expect(button(page, 'Custom list sort')).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Sort selected range' }).selectOption('asc')
  await records(page, ['E10', 'E30', 'W20', 'W10'])
  await button(page, 'Undo').click(); await records(page, ['W20', 'W10', 'E10', 'E30'])
})
