import { expect, test } from '@playwright/test'
import { downloadDateFile as downloadFile, openDateFile as openFile } from '../support/conditional-dates'
import { copy, paste } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { start, open, selectText, text, dialog, button, save, cell, go } from '../support/rich-baseline'

test('edited inline baselines survive native and XLSX reopen without the optional tools', async ({ page }) => {
  await start(page); await open(page, 'D9'); await selectText(text(page), 1, 1)
  await button(dialog(page), 'Superscript').click(); await save(page)
  const native = await downloadFile(page), xlsx = await downloadFile(page, true)
  await page.goto('/?locale=en'); await expect(cell(page, '1:0')).toHaveText('SO-10001')
  for (const [bytes, ext] of [[native, 'einfach.json'], [xlsx, 'xlsx']] as const) {
    await openFile(page, bytes, ext)
    await page.getByRole('tab', { name: 'Summary', exact: true }).click()
    await go(page, 'D9')
    await expect(cell(page, '8:3').locator('[data-font-baseline="superscript"]')).toHaveText('2')
    await expect(cell(page, '8:3')).toHaveText('H2O')
    await expect(button(page, 'Undo')).toBeDisabled()
    await open(page, 'D9'); await selectText(text(page), 1, 1)
    await expect(dialog(page).locator('[data-rich-text-format]')).toHaveCount(0)
    await button(dialog(page), 'Italic').click(); await save(page)
    await expect(cell(page, '8:3').locator('[data-font-baseline="superscript"]')).toHaveCSS('font-style', 'italic')
    await button(page, 'Undo').click()
    await expect(cell(page, '8:3').locator('[data-font-baseline="superscript"]')).toHaveCSS('font-style', 'normal')
  }
})

test('copy cut fill and values-only preserve the edited inline baseline contract', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await start(page); await open(page, 'D9'); await selectText(text(page), 1, 1)
  await button(dialog(page), 'Superscript').click(); await save(page)
  await go(page, 'D9'); await copy(page); await go(page, 'F12'); await paste(page)
  await expect(cell(page, '11:5').locator('[data-font-baseline="superscript"]')).toHaveText('2')
  await go(page, 'F12:F13'); await showRibbonItem(page, 'data.fill-selected-range')
  await page.getByRole('combobox', { name: 'Fill selected range' }).selectOption('down')
  await expect(cell(page, '12:5').locator('[data-font-baseline="superscript"]')).toHaveText('2')
  await go(page, 'F13'); await copy(page, 'Cut'); await go(page, 'F14'); await paste(page)
  await expect(cell(page, '12:5')).toHaveText('')
  await expect(cell(page, '13:5').locator('[data-font-baseline="superscript"]')).toHaveText('2')
  await button(page, 'Undo').click()
  await expect(cell(page, '12:5').locator('[data-font-baseline="superscript"]')).toHaveText('2')
  // F14 originally contains =1/0; Undo restores that formula, not a blank.
  await expect(cell(page, '13:5')).toHaveText('#DIV/0!')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=1/0')
  await go(page, 'F12'); await copy(page); await go(page, 'F13'); await paste(page, 'Paste values only')
  await expect(cell(page, '12:5')).toHaveText('H2O')
  await expect(cell(page, '12:5').locator('.cell-content > span')).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(cell(page, '12:5').locator('[data-font-baseline="superscript"]')).toHaveText('2')
  await expect(cell(page, '8:2')).toHaveText('Inline subscript')
})
