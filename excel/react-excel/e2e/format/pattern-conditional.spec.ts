import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { patternCell as cell, patternButton as button, patternWorkbook, openPattern, applyPattern,
  expectPattern } from '../support/pattern-fill'

test('conditional solid backgrounds hide the pattern only while the rule matches', async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, patternWorkbook)
  await select(page, 'D2', '1:3'); await openPattern(page, 'darkUp', '#c00000', '#fff2cc'); await applyPattern(page)
  const before = JSON.parse((await downloadFile(page)).toString()).workbook.formats
  await showRibbonItem(page, 'format.conditional-formatting'); await button(page, 'Conditional formatting').click()
  await page.getByLabel('Value', { exact: true }).fill('10')
  await page.getByLabel('Highlight fill', { exact: true }).fill('#00ff00')
  await button(page, 'Add rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expectPattern(page, '1:3'); await expect(cell(page, '1:3')).toHaveCSS('background-color', 'rgb(0, 255, 0)')
  expect(JSON.parse((await downloadFile(page)).toString()).workbook.formats).toEqual(before)
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('=2/2'); await input.press('Enter')
  await expectPattern(page, '1:3', 'darkUp')
  await expect(cell(page, '1:3')).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await button(page, 'Undo').click(); await expectPattern(page, '1:3')
  await button(page, 'Undo').click(); await expectPattern(page, '1:3', 'darkUp')
  await expectPattern(page, '1:2')
})
