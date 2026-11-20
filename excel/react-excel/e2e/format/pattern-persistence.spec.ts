import { expect, test } from '@playwright/test'
import { copy, paste, select } from '../support/clipboard'
import { showRibbonControl, showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { patternCell as cell, patternButton as button, patternWorkbook, openPattern, applyPattern,
  expectPattern } from '../support/pattern-fill'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, patternWorkbook)
  await select(page, 'B2', '1:1'); await openPattern(page, 'lightDown', '#c00000', '#fff2cc'); await applyPattern(page)
})

for (const writer of ['copy-all', 'formats', 'painter'])
  test(`${writer} carries both pattern colors without replacing neighboring pattern facts`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await select(page, 'D2', '1:3'); await openPattern(page, 'gray125', '#008000', '#abcdef'); await applyPattern(page)
    await select(page, 'B2', '1:1')
    if (writer === 'painter') {
      await showRibbonControl(page, 'Format painter'); await button(page, 'Format painter').click()
      await cell(page, '1:2').click()
      await expect(page.getByLabel('Format painter status')).toContainText('Formatting applied.')
    } else {
      await copy(page); await select(page, 'C2', '1:2')
      await paste(page, writer === 'formats' ? 'Paste formatting only' : 'Paste')
    }
    await expectPattern(page, '1:2', 'lightDown')
    await expect(cell(page, '1:2')).toHaveCSS('background-color', 'rgb(255, 242, 204)')
    await expect(cell(page, '1:2')).toHaveText(writer === 'copy-all' ? '' : 'C2 kept')
    await expectPattern(page, '1:3', 'gray125', '#008000')
    await button(page, 'Undo').click(); await expectPattern(page, '1:2')
    await expectPattern(page, '1:1', 'lightDown')
    await expectPattern(page, '1:3', 'gray125', '#008000')
    await button(page, 'Redo').click(); await expectPattern(page, '1:2', 'lightDown')
  })

test('fill clear formatting and repeat carry pattern transactions without changing source values', async ({ page }) => {
  await select(page, 'C2', '1:2'); await button(page, 'Repeat').click()
  await expectPattern(page, '1:2', 'lightDown')
  await select(page, 'B2:B3', '1:1'); await showRibbonItem(page, 'data.fill-selected-range')
  await page.getByRole('combobox', { name: 'Fill selected range' }).selectOption('down')
  await expectPattern(page, '2:1', 'lightDown')
  await button(page, 'Undo').click(); await expectPattern(page, '2:1')
  await expect(cell(page, '2:1')).toHaveText('B3 kept')
  await select(page, 'B2', '1:1'); await showRibbonControl(page, 'Clear formatting')
  await button(page, 'Clear formatting').click(); await expectPattern(page, '1:1')
  await button(page, 'Undo').click(); await expectPattern(page, '1:1', 'lightDown')
  const native = await downloadFile(page)
  await openFile(page, native); await expectPattern(page, '1:1', 'lightDown')
  await expectPattern(page, '1:2', 'lightDown')
  await expect(cell(page, '1:2')).toHaveText('C2 kept')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('sparse row pattern and a no-fill cell remain distinct after Excel reopen', async ({ page }) => {
  await page.getByRole('button', { name: 'Select row 3', exact: true }).click()
  await openPattern(page, 'gray0625', '#c00000', '#fff2cc'); await applyPattern(page)
  await expectPattern(page, '2:0', 'gray0625'); await expectPattern(page, '2:3', 'gray0625')
  await select(page, 'B3', '2:1')
  await showRibbonItem(page, 'format.fill-color-palette'); await button(page, 'Choose fill color').click()
  await button(page, 'No fill').click(); await expectPattern(page, '2:1')
  const before = JSON.parse((await downloadFile(page)).toString()).workbook
  const range = before.formats.find((range: { rowStyles?: { index: number }[] }) => range.rowStyles?.length)
  expect(range.rowStyles).toHaveLength(1)
  expect(range.cellStyles.length).toBeLessThan(8)
  await openFile(page, await downloadFile(page, true), 'xlsx')
  await expectPattern(page, '2:1')
  await expectPattern(page, '2:0', 'gray0625'); await expectPattern(page, '2:3', 'gray0625')
  await expect(cell(page, '2:1')).toHaveText('B3 kept')
})
