import { expect, test } from '@playwright/test'
import { copy, paste, select } from '../support/clipboard'
import { showRibbonItem, showRibbonControl } from '../support/ribbon'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { baselinePixelFile } from '../support/font-baseline-pixels'
import { applyBaseline, baselineButton as button, baselineCell as cell } from '../support/font-baseline'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=text-format')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, baselinePixelFile)
})

test('copy fill and clear preserve baseline semantics and each restores in one undo', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await select(page, 'B1', '0:1'); await copy(page)
  await select(page, 'D1', '0:3'); await paste(page)
  await expect(cell(page, '0:3').locator('[data-font-baseline="superscript"]')).toHaveText('Hg')
  await button(page, 'Undo').click()
  await expect(cell(page, '0:3')).toHaveText('')
  await button(page, 'Redo').click()
  await select(page, 'D1:D3', '0:3')
  await showRibbonItem(page, 'data.fill-selected-range')
  await page.getByRole('combobox', { name: 'Fill selected range' }).selectOption('down')
  await expect(cell(page, '2:3').locator('[data-font-baseline="superscript"]')).toHaveText('Hg')
  await button(page, 'Undo').click()
  await expect(cell(page, '2:3')).toHaveText('')
  await expect(cell(page, '0:3')).toHaveText('Hg')
  await select(page, 'D1', '0:3')
  await showRibbonControl(page, 'Clear formatting'); await button(page, 'Clear formatting').click()
  await expect(cell(page, '0:3').locator('[data-font-baseline]')).toHaveCount(0)
  await expect(cell(page, '0:3')).toHaveText('Hg')
  await button(page, 'Undo').click()
  await expect(cell(page, '0:3').locator('[data-font-baseline="superscript"]')).toHaveText('Hg')
})

test('column row and explicit cell normal retain sparse inheritance through native reopen', async ({ page }) => {
  await page.getByRole('columnheader', { name: 'Select column D', exact: true }).click()
  await applyBaseline(page, 'Superscript')
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await applyBaseline(page, 'Subscript')
  await select(page, 'D2', '1:3')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('Explicit normal'); await input.press('Enter')
  await select(page, 'D2', '1:3')
  await applyBaseline(page, 'Subscript')
  await expect(cell(page, '1:3').locator('[data-font-baseline]')).toHaveCount(0)
  const bytes = await downloadFile(page)
  const native = JSON.parse(bytes.toString())
  const formats = native.workbook.formats[0]
  expect(formats.columnStyles.find((style: { index: number }) => style.index === 3).format.fontBaseline).toBe('superscript')
  expect(formats.rowStyles.find((style: { index: number }) => style.index === 1).format.fontBaseline).toBe('subscript')
  expect(formats.cellStyles.find((style: { addr: string }) => style.addr === 'D2').format.fontBaseline).toBe('normal')
  expect(native.workbook.cells).toHaveLength(4)
  await openFile(page, bytes)
  await expect(cell(page, '1:3')).toHaveText('Explicit normal')
  await expect(cell(page, '1:3').locator('[data-font-baseline]')).toHaveCount(0)
  await select(page, 'D2', '1:3')
  await applyBaseline(page, 'Superscript')
  await expect(cell(page, '1:3').locator('[data-font-baseline="superscript"]')).toHaveText('Explicit normal')
  await button(page, 'Undo').click()
  await expect(cell(page, '1:3').locator('[data-font-baseline]')).toHaveCount(0)
  await expect(button(page, 'Undo')).toBeDisabled()
})
