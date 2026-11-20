import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { start, enable, open, rank, apply, visible, button, cell, menu } from '../support/top-filter'

for (const width of [1280, 390]) test(`table top filter excludes its total and undoes once at ${width}px`, async ({ page }) => {
  await start(page, width); await select(page, 'A80', '79:0')
  await open(page, 'B', 'DemoTable'); await rank(page, '1'); await apply(page)
  await expect(cell(page, '79:0')).toHaveText('Product')
  await expect(cell(page, '80:0')).toHaveCount(0)
  await expect(cell(page, '81:0')).toHaveCount(0)
  await expect(cell(page, '82:1')).toHaveText('30')
  await expect(cell(page, '83:1')).toHaveText('30')
  await expect(cell(page, '84:1')).toHaveText('ALPHA')
  await button(page, 'Undo').click()
  await expect(cell(page, '80:1')).toHaveText('10')
  await expect(cell(page, '81:1')).toHaveText('20')
  await expect(cell(page, '83:1')).toHaveText('60')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '80:0')).toHaveCount(0)
  await expect(cell(page, '83:1')).toHaveText('30')
})

test('ordinary and Table rank filters retain separate snapshots when one is cleared', async ({ page }) => {
  await start(page); await enable(page); await open(page); await rank(page); await apply(page)
  await select(page, 'A80', '79:0'); await open(page, 'B', 'DemoTable')
  await rank(page, '1', 'bottom'); await apply(page)
  await expect(cell(page, '80:1')).toHaveText('10')
  await expect(cell(page, '81:0')).toHaveCount(0)
  await expect(cell(page, '83:1')).toHaveText('10')
  await showRibbonItem(page, 'data.worksheet-filter'); await menu(page).selectOption('clear')
  await expect(cell(page, '81:1')).toHaveText('20')
  await expect(cell(page, '83:1')).toHaveText('60')
  await visible(page, [0, 1, 2])
  await button(page, 'Undo').click(); await select(page, 'A80', '79:0')
  await expect(cell(page, '81:0')).toHaveCount(0)
  await visible(page, [0, 1, 2])
})
