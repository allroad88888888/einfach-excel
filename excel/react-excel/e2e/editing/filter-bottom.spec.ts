import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { start, enable, open, rank, apply, visible, undoRedo, button, cell, menu } from '../support/top-filter'

test('bottom items include negative numbers and numeric formulas in one undo', async ({ page }) => {
  await start(page)
  await select(page, 'F6', '5:5')
  await page.getByRole('textbox', { name: 'Active cell value' }).fill('-5')
  await page.getByRole('textbox', { name: 'Active cell value' }).press('Enter')
  await enable(page); await open(page); await rank(page, '2', 'bottom'); await apply(page)
  await visible(page, [3, 6])
  await expect(cell(page, '5:5')).toHaveText('-5')
  await expect(cell(page, '8:5')).toHaveText('70')
  await button(page, 'Undo').click(); await visible(page, [0, 1, 2, 3, 4, 5, 6])
  await button(page, 'Redo').click(); await visible(page, [3, 6])
})

test('bottom percent excludes text and blank cells from the numeric population', async ({ page }) => {
  await start(page); await enable(page); await open(page)
  await rank(page, '21', 'bottom', 'percent'); await apply(page)
  await undoRedo(page, [3, 6])
})

test('rank filtering preserves its snapshot until reapply and undo restores the prior result', async ({ page }) => {
  await start(page); await enable(page); await open(page); await rank(page); await apply(page)
  await select(page, 'F3', '2:5')
  await page.getByRole('textbox', { name: 'Active cell value' }).fill('-10')
  await page.getByRole('textbox', { name: 'Active cell value' }).press('Enter')
  await visible(page, [0, 1, 2])
  await showRibbonItem(page, 'data.worksheet-filter'); await menu(page).selectOption('reapply')
  await visible(page, [1, 2])
  await button(page, 'Undo').click(); await visible(page, [0, 1, 2])
  await expect(cell(page, '2:5')).toHaveText('-10')
  await button(page, 'Undo').click(); await expect(cell(page, '2:5')).toHaveText('100')
  await button(page, 'Redo').click(); await button(page, 'Redo').click(); await visible(page, [1, 2])
})
