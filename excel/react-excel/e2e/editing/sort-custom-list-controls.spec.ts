import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { start, save, open, configure, apply, records, history, original, cell, panel, button } from '../support/custom-list-sort'

for (const action of ['add', 'remove', 'up', 'down', 'column'] as const)
  test(`list sort ${action} changes level priority through the dialog`, async ({ page }) => {
    await start(page); await save(page); await open(page); await configure(page)
    await panel(page).getByRole('button', { name: 'Add level', exact: true }).click()
    if (action === 'column') {
      await panel(page).getByLabel('Sort column 2', { exact: true }).selectOption('2')
    }
    if (action === 'remove')
      await panel(page).getByRole('button', { name: 'Remove sort level 2', exact: true }).click()
    if (action === 'up' || action === 'down') {
      await panel(page).getByRole('button', { name: 'Move sort level 2 up', exact: true }).click()
      await expect(panel(page).getByLabel('Sort column 1', { exact: true })).toBeFocused()
      if (action === 'down') {
        await panel(page).getByRole('button', { name: 'Move sort level 1 down', exact: true }).click()
        await expect(panel(page).getByLabel('Sort column 2', { exact: true })).toBeFocused()
      }
    }
    const expected = action === 'remove' ? ['W20', 'W10', 'E10', 'E30']
      : action === 'up' ? ['W10', 'E10', 'W20', 'E30'] : ['W10', 'W20', 'E10', 'E30']
    await apply(page); await history(page, expected)
  })

test('list sort header option controls first-row movement', async ({ page }) => {
  await start(page); await save(page); await open(page); await configure(page)
  await panel(page).getByLabel('First row is a header').uncheck()
  await apply(page)
  await records(page, ['W20', 'W10', 'E10', 'E30', 'Record'], 24)
  await expect(cell(page, '24:3')).toHaveText('')
  await button(page, 'Undo').click(); await records(page, original)
  await expect(cell(page, '24:2')).toHaveText('Record')
  await expect(button(page, 'Undo')).toBeDisabled()
})

for (const width of [1280, 390]) for (const action of ['Cancel', 'Escape', 'Tab', 'Shift+Tab'] as const)
  test(`${action} list-sort dialog preserves data and native redo at ${width}px`, async ({ page }) => {
    await start(page, width); await save(page); await open(page); await configure(page); await apply(page)
    await button(page, 'Undo').click()
    await open(page); await configure(page)
    await panel(page).getByRole('button', { name: 'Add level', exact: true }).click()
    const first = panel(page).getByLabel('First row is a header')
    const last = panel(page).getByRole('button', { name: 'Cancel', exact: true })
    if (action === 'Tab') { await last.focus(); await page.keyboard.press('Tab'); await expect(first).toBeFocused() }
    if (action === 'Shift+Tab') { await first.focus(); await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused() }
    if (action === 'Escape') await page.keyboard.press('Escape')
    else await last.click()
    await expect(panel(page)).toHaveCount(0)
    await showRibbonItem(page, 'data.custom-list-sort')
    await expect(button(page, 'Custom list sort')).toBeFocused()
    await records(page, original)
    await expect(button(page, 'Undo')).toBeDisabled()
    await expect(button(page, 'Redo')).toBeEnabled()
    await button(page, 'Redo').click(); await records(page, ['W20', 'W10', 'E10', 'E30'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
