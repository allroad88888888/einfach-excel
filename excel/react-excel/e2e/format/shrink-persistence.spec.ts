import { expect, test } from '@playwright/test'
import { copy, paste, select } from '../support/clipboard'
import { showRibbonControl, showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile } from '../support/conditional-dates'
import { baselineCell as cell, baselineButton as button } from '../support/font-baseline'
import { shrinkWorkbook } from '../support/shrink-workbook'
import { shrinkText, toggleShrink, expectShrinkFits } from '../support/shrink-to-fit'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=text-format')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, shrinkWorkbook)
})

test('copy fill values-only and clear use the existing shrink format history', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await select(page, 'A1', '0:0'); await copy(page)
  await select(page, 'F1', '0:5'); await paste(page)
  await expectShrinkFits(cell(page, '0:5'))
  await expect(cell(page, '0:5')).toHaveCSS('font-size', '24px')
  await select(page, 'F1:F3', '0:5'); await showRibbonItem(page, 'data.fill-selected-range')
  await page.getByRole('combobox', { name: 'Fill selected range' }).selectOption('down')
  await expectShrinkFits(cell(page, '2:5'))
  await button(page, 'Undo').click(); await expect(cell(page, '2:5')).toHaveText('')
  await button(page, 'Redo').click(); await expectShrinkFits(cell(page, '2:5'))
  await select(page, 'G1', '0:6'); await paste(page, 'Paste values only')
  await expect(cell(page, '0:6')).toHaveText(await cell(page, '0:0').textContent() ?? '')
  await expect(shrinkText(cell(page, '0:6'))).toHaveCount(0)
  await select(page, 'F1', '0:5'); await showRibbonControl(page, 'Clear formatting')
  await button(page, 'Clear formatting').click()
  await expect(shrinkText(cell(page, '0:5'))).toHaveCount(0)
  await button(page, 'Undo').click(); await expectShrinkFits(cell(page, '0:5'))
})

test('repeat replays the resolved shrink flags instead of toggling the next selection', async ({ page }) => {
  await select(page, 'A1', '0:0'); await toggleShrink(page)
  await expect(shrinkText(cell(page, '0:0'))).toHaveCount(0)
  await select(page, 'B1', '0:1'); await button(page, 'Repeat').click()
  await expect(shrinkText(cell(page, '0:1'))).toHaveCount(0)
  await button(page, 'Undo').click()
  await expect(shrinkText(cell(page, '0:1'))).toHaveAttribute('data-shrink-scale', '1')
  await expect(shrinkText(cell(page, '0:0'))).toHaveCount(0)
  await button(page, 'Undo').click(); await expectShrinkFits(cell(page, '0:0'))
  await expect(button(page, 'Undo')).toBeDisabled()
})
