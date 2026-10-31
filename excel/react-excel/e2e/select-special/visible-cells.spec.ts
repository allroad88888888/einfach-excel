import { expect, test } from '@playwright/test'
import { copy, paste } from '../support/clipboard'
import { button, cell, filterWest, focusGrid, nameBox, openSummary, select, selectedCells,
  status } from './support'

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openSummary(page)
})

/** 筛选后 A25:C29 中只有表头、W20、W10 三行可见（0 起第 24、25、27 行）。 */
const VISIBLE_ROWS = [24, 25, 27]
const cellsOf = (rows: number[], cols: number[]) =>
  rows.flatMap((row) => cols.map((col) => `${row}:${col}`))

test('Alt+Semicolon selects only the visible filtered blocks at 1280px', async ({ page }) => {
  await filterWest(page)
  await select(page, 'A25:C29', '24:0')
  await focusGrid(page)
  await page.keyboard.press('Alt+;')
  await expect(status(page)).toContainText('Selected 9 visible cells in 2 areas.')
  expect(await selectedCells(page)).toEqual(cellsOf(VISIBLE_ROWS, [0, 1, 2]))
})

test('copying visible cells only pastes the visible values at 1280px', async ({ page }) => {
  await filterWest(page)
  await select(page, 'A25:C29', '24:0')
  await focusGrid(page)
  await page.keyboard.press('Alt+;')
  await expect(status(page)).toContainText('2 areas')
  await copy(page)
  await select(page, 'A60', '59:0')
  await paste(page)
  await expect(cell(page, 59, 0)).toHaveText('Team')
  await expect(cell(page, 60, 2)).toHaveText('W20')
  await expect(cell(page, 61, 2)).toHaveText('W10')
  await expect(cell(page, 62, 2)).toHaveCount(1)
  await expect(cell(page, 62, 0)).toHaveText('')
  await expect(cell(page, 62, 2)).toHaveText('')
})

test('visible cells skips a hidden column and copy pastes the remaining columns at 1280px', async ({ page }) => {
  await select(page, 'B25', '24:1')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-columns')
  await expect(cell(page, 24, 1)).toHaveCount(0)
  await select(page, 'A25:C26', '24:0')
  await focusGrid(page)
  await page.keyboard.press('Alt+;')
  await expect(status(page)).toContainText('Selected 4 visible cells in 2 areas.')
  expect(await selectedCells(page)).toEqual(cellsOf([24, 25], [0, 2]))
  await copy(page)
  await select(page, 'A60', '59:0')
  await paste(page)
  // 隐藏的 B 列没有进入剪贴板：C 列内容紧挨 A 列落在 B60，C60 保持空白。
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('unhide-all')
  await expect(cell(page, 59, 0)).toHaveText('Team')
  await expect(cell(page, 60, 1)).toHaveText('W20')
  await expect(cell(page, 60, 2)).toHaveText('')
})

test('Go to special Visible cells only selects the visible blocks and closes the dialog at 1280px', async ({ page }) => {
  await filterWest(page)
  await select(page, 'A25:C29', '24:0')
  await button(page, 'Go to special').click()
  const dialog = page.getByRole('dialog', { name: 'Go to special' })
  await dialog.getByRole('button', { name: 'Visible cells only', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(await selectedCells(page)).toEqual(cellsOf(VISIBLE_ROWS, [0, 1, 2]))
  await expect(page.locator('[data-workbook-grid="true"]')).toBeFocused()
  await expect(nameBox(page)).not.toHaveValue('')
})
