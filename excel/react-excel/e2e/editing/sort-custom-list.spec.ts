import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { start, save, open, configure, apply, records, history, cell, panel, button } from '../support/custom-list-sort'

for (const width of [1280, 390]) {
  test(`saved fill list sorts complete records through the optional plugin at ${width}px`, async ({ page }, info) => {
    await start(page, width); await save(page); await open(page); await configure(page)
    await expect(panel(page).getByText('West → East')).toBeVisible()
    expect(await panel(page).evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`list-sort-${width}.png`) })
    await apply(page)
    await history(page, ['W20', 'W10', 'E10', 'E30'])
    await expect(cell(page, '25:2')).toHaveCSS('font-weight', '700')
    await expect(cell(page, '27:2')).toHaveCSS('font-style', 'italic')
    await expect(cell(page, '28:2')).toHaveCSS('text-decoration-line', 'underline')
    await showRibbonItem(page, 'data.custom-list-sort')
    await button(page, 'Custom list sort').click(); await configure(page); await apply(page)
    await expect(page.getByLabel('Sort status')).toHaveText('Already in order.')
    await button(page, 'Undo').click()
    await records(page, ['W20', 'E10', 'W10', 'E30'])
    await expect(button(page, 'Undo')).toBeDisabled()
  })
  test(`descending list sort reverses native priority in one undo at ${width}px`, async ({ page }) => {
    await start(page, width); await save(page); await open(page); await configure(page)
    await panel(page).getByLabel('Sort order 1', { exact: true }).selectOption('desc')
    await apply(page); await history(page, ['E10', 'E30', 'W20', 'W10'])
  })
}

test('edited fill directory is reused by the next sort without a second list registry', async ({ page }) => {
  await start(page); await save(page); await open(page); await configure(page); await apply(page)
  await button(page, 'Undo').click()
  await save(page, 'Team order', 'East\nWest')
  await expect(button(page, 'Redo')).toBeEnabled()
  await open(page); await configure(page)
  await expect(panel(page).getByText('East → West')).toBeVisible()
  await apply(page); await history(page, ['E10', 'E30', 'W20', 'W10'])
})

test('missing list choice stays correctable without writing and applies after selection', async ({ page }) => {
  await start(page); await save(page); await open(page)
  await panel(page).getByRole('button', { name: 'Apply sort', exact: true }).click()
  await expect(panel(page).getByRole('alert')).toHaveText('Choose a list for at least one sort level.')
  await expect(button(page, 'Undo')).toBeDisabled()
  await configure(page); await apply(page); await history(page, ['W20', 'W10', 'E10', 'E30'])
})

test('list sort preserves filtered row slots and includes manually hidden rows', async ({ page }) => {
  await start(page); await save(page)
  await select(page, 'A26', '25:0')
  await showRibbonItem(page, 'view.row-and-column-visibility')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('hide-rows')
  await select(page, 'A25:C29', '24:0')
  await showRibbonItem(page, 'data.worksheet-filter')
  await page.getByRole('combobox', { name: 'Worksheet filter' }).selectOption('selection')
  await button(page, 'Filter column C').click()
  await page.getByLabel('Filter condition 1').selectOption('list')
  await page.getByLabel('Filter value 1', { exact: true }).fill('W20\nW10\nE30')
  await button(page, 'Apply filter').click()
  await open(page); await configure(page)
  await panel(page).getByLabel('Sort order 1', { exact: true }).selectOption('desc')
  await apply(page)
  await expect(cell(page, '25:2')).toHaveCount(0)
  await expect(cell(page, '26:2')).toHaveCount(0)
  await expect(cell(page, '27:2')).toHaveText('W20')
  await expect(cell(page, '28:2')).toHaveText('W10')
  await button(page, 'Undo').click(); await expect(cell(page, '28:2')).toHaveText('E30')
  await button(page, 'Redo').click(); await expect(cell(page, '28:2')).toHaveText('W10')
  await showRibbonItem(page, 'view.row-and-column-visibility')
  await page.getByRole('combobox', { name: 'Row and column visibility' }).selectOption('unhide-all')
  await expect(cell(page, '25:2')).toHaveText('E30')
  await expect(cell(page, '26:2')).toHaveCount(0)
})

test('uninstalled and individually hidden list-sort plugins leave ordinary sort available', async ({ page }) => {
  for (const query of ['', '?plugins=data-sort&hide=ribbon:data.custom-list-sort',
    '?plugins=data-sort&hide=ribbon:plugin:data-sort:custom-list']) {
    await page.goto(`/${query}`)
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await showRibbonItem(page, 'data.sort-selected-range')
    await expect(page.getByRole('combobox', { name: 'Sort selected range' })).toBeVisible()
    await expect(button(page, 'Custom list sort')).toHaveCount(0)
  }
})
