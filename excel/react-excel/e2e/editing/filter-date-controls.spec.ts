import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { launch, boundaries, open, choose, apply, rows, button, cell, menu, dialog, go } from '../support/date-filter'

test('date filter Escape discards its draft and preserves redo and header focus', async ({ page }) => {
  await launch(page); await boundaries(page); await open(page); await choose(page); await apply(page)
  await button(page, 'Undo').click(); await rows(page, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  await open(page); await choose(page, 'tomorrow'); await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(button(page, 'Filter column B')).toBeFocused()
  await expect(button(page, 'Redo')).toBeEnabled()
  await button(page, 'Redo').click(); await rows(page, [2, 3, 4])
})

test('date filter reapply alone updates edited dates and Undo restores the prior snapshot', async ({ page }) => {
  await launch(page); await boundaries(page); await open(page); await choose(page); await apply(page)
  await go(page, 'B3')
  await cell(page, '2:1').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('=TODAY()+2'); await editor.press('Enter')
  await rows(page, [2, 3, 4])
  await showRibbonItem(page, 'data.worksheet-filter'); await menu(page).selectOption('reapply')
  await rows(page, [3, 4])
  await button(page, 'Undo').click(); await rows(page, [2, 3, 4])
  await go(page, 'B3')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=TODAY()+2')
  await button(page, 'Undo').click()
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=TODAY()')
})

test('date periods in OR groups keep their own boundaries on the same column', async ({ page }) => {
  await launch(page); await boundaries(page)
  await showRibbonItem(page, 'data.worksheet-filter'); await menu(page).selectOption('open')
  await dialog(page).getByLabel('Filter column 1', { exact: true }).selectOption('1')
  await choose(page, 'yesterday')
  await button(page, 'Add OR group').click()
  await dialog(page).getByLabel('Filter column 2', { exact: true }).selectOption('1')
  await choose(page, 'tomorrow', 2); await apply(page)
  await rows(page, [1, 5]); await open(page)
  await expect(page.getByLabel('Date period 1', { exact: true })).toHaveValue('yesterday')
  await expect(page.getByLabel('Date period 2', { exact: true })).toHaveValue('tomorrow')
})

test('date value candidates omit their own condition and retain other-column date conditions', async ({ page }) => {
  await launch(page); await boundaries(page); await open(page); await choose(page); await apply(page)
  await open(page, 'A'); await button(page, 'Choose values for condition 1').click()
  for (const row of [2, 3, 4]) await expect(page.getByRole('checkbox', { name: `Select value R${row}`, exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Select value R1', exact: true })).toHaveCount(0)
  await button(page, 'Cancel').click(); await open(page)
  await button(page, 'Choose values for condition 1').click()
  await expect(page.getByRole('checkbox', { name: 'Select value 2024-02-29', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Select value (Blanks)', exact: true })).toBeVisible()
  await button(page, 'Cancel').click(); await rows(page, [2, 3, 4])
})

test('date AND rank uses the full score domain before intersecting calendar matches', async ({ page }) => {
  await launch(page); await boundaries(page); await open(page); await choose(page); await apply(page)
  await open(page, 'C'); await button(page, 'Top / Bottom…').click()
  await page.getByLabel('Rank amount 1', { exact: true }).fill('2'); await apply(page)
  await rows(page, [2])
  await button(page, 'Undo').click(); await rows(page, [2, 3, 4])
  await button(page, 'Redo').click(); await rows(page, [2])
})
