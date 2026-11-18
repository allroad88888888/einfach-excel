import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { patternCell as cell, patternButton as button, patternWorkbook, openPattern, applyPattern,
  expectPattern } from '../support/pattern-fill'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, patternWorkbook); await select(page, 'B2', '1:1')
})

test('Solid fill replaces a pattern and No fill removes both colors and the pattern', async ({ page }) => {
  await openPattern(page, 'gray125', '#c00000', '#fff2cc'); await applyPattern(page)
  const before = JSON.parse((await downloadFile(page)).toString()).workbook
  await showRibbonItem(page, 'format.fill-color'); await button(page, 'Fill color').click()
  await expectPattern(page, '1:1')
  await expect(cell(page, '1:1')).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await button(page, 'Undo').click(); await expectPattern(page, '1:1', 'gray125')
  await showRibbonItem(page, 'format.fill-color-palette'); await button(page, 'Choose fill color').click()
  await button(page, 'No fill').click(); await expectPattern(page, '1:1')
  await expect(cell(page, '1:1')).not.toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await expectPattern(page, '2:1')
  await button(page, 'Undo').click()
  expect(JSON.parse((await downloadFile(page)).toString()).workbook).toEqual(before)
})

test('Cancel discards an uncommitted pattern draft and returns focus to its opener', async ({ page }) => {
  await openPattern(page, 'darkUp', '#123abc', '#fedcba')
  await button(page, 'Cancel').click()
  await expect(button(page, 'Pattern fill')).toBeFocused()
  await expectPattern(page, '1:1'); await expect(button(page, 'Undo')).toBeDisabled()
  await openPattern(page)
  await expect(page.getByLabel('Pattern', { exact: true })).toHaveValue('lightDown')
  await expect(page.getByLabel('Pattern color')).toHaveValue('#000000')
})

test('Escape dismisses a pattern draft without changing cell formats or history', async ({ page }) => {
  await openPattern(page, 'gray0625', '#123abc', '#fedcba')
  await page.getByLabel('Background color').focus(); await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Pattern fill' })).toHaveCount(0)
  await expect(button(page, 'Pattern fill')).toBeFocused()
  await expectPattern(page, '1:1'); await expectPattern(page, '2:1')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('invalid colors keep the draft until correction and commit one history entry', async ({ page }) => {
  await openPattern(page, 'lightGrid', 'red', '#fff2cc'); await button(page, 'Apply fill').click()
  await expect(page.getByRole('alert')).toContainText('valid #RRGGBB')
  await expect(page.getByLabel('Pattern color')).toHaveValue('red')
  await expect(button(page, 'Undo')).toBeDisabled(); await expectPattern(page, '1:1')
  await page.getByLabel('Pattern color').fill('#c00000'); await applyPattern(page)
  await expectPattern(page, '1:1', 'lightGrid')
  await button(page, 'Undo').click(); await expectPattern(page, '1:1')
  await expect(button(page, 'Undo')).toBeDisabled()
})
