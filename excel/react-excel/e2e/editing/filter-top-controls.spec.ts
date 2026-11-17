import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { start, enable, open, rank, apply, visible, button, dialog, menu } from '../support/top-filter'

test('rank bounds keep the dialog recoverable and Cancel preserves redo at 390px', async ({ page }) => {
  await start(page, 390); await enable(page); await open(page); await rank(page); await apply(page)
  await button(page, 'Undo').click()
  await open(page); await rank(page)
  const amount = dialog(page).getByLabel('Rank amount 1', { exact: true })
  for (const value of ['0', '501', '1.5', '']) {
    await amount.fill(value)
    await button(page, 'Apply filter').click()
    await expect(dialog(page)).toBeVisible()
    expect(await amount.evaluate((node: HTMLInputElement) => node.checkValidity())).toBe(false)
  }
  await rank(page, '101', 'top', 'percent')
  await button(page, 'Apply filter').click(); await expect(dialog(page)).toBeVisible()
  await button(page, 'Cancel').click()
  await expect(button(page, 'Redo')).toBeEnabled()
  await visible(page, [0, 1, 2, 3, 4, 5, 6])
  await button(page, 'Redo').click(); await visible(page, [0, 1, 2])
  await open(page); await rank(page, '100', 'bottom', 'percent'); await apply(page)
  await visible(page, [0, 1, 2, 3, 6])
})

test('Escape drops a changed rank draft and restores header focus', async ({ page }) => {
  await start(page); await enable(page); await open(page); await rank(page); await apply(page)
  await open(page); await rank(page, '1', 'bottom'); await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(button(page, 'Filter column F')).toBeFocused()
  await visible(page, [0, 1, 2]); await open(page)
  await expect(dialog(page).getByLabel('Rank amount 1', { exact: true })).toHaveValue('2')
})

test('OR groups preserve independent rank thresholds on the same column', async ({ page }) => {
  await start(page); await enable(page)
  await showRibbonItem(page, 'data.worksheet-filter'); await menu(page).selectOption('open')
  await dialog(page).getByLabel('Filter column 1', { exact: true }).selectOption('5')
  await rank(page, '1')
  await button(page, 'Add OR group').click()
  await dialog(page).getByLabel('Filter column 2', { exact: true }).selectOption('5')
  await rank(page, '2', 'bottom', 'items', 2)
  await apply(page); await visible(page, [0, 3, 6])
  await open(page)
  await expect(dialog(page).getByLabel('Rank amount 1', { exact: true })).toHaveValue('1')
  await expect(dialog(page).getByLabel('Rank amount 2', { exact: true })).toHaveValue('2')
  await button(page, 'Cancel').click()
  await button(page, 'Undo').click(); await visible(page, [0, 1, 2, 3, 4, 5, 6])
  await button(page, 'Redo').click(); await visible(page, [0, 3, 6])
})

test('value candidates exclude their own rank criterion but retain other-column ranks', async ({ page }) => {
  await start(page); await enable(page); await open(page); await rank(page, '1'); await apply(page)
  await open(page, 'E')
  await button(page, 'Choose values for condition 1').click()
  await expect(page.getByRole('checkbox', { name: 'Select value Exclude 100', exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Select value Keep 90 A', exact: true })).toHaveCount(0)
  await button(page, 'Cancel').click()
  await open(page)
  await button(page, 'Choose values for condition 1').click()
  for (const value of ['100', '90', '80', '70', '999', '(Blanks)'])
    await expect(page.getByRole('checkbox', { name: `Select value ${value}`, exact: true })).toBeVisible()
  await button(page, 'Cancel').click(); await visible(page, [0])
})
