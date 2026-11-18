import { expect, test } from '@playwright/test'
import { copy, paste, select } from '../support/clipboard'
import { showRibbonControl, showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile } from '../support/conditional-dates'
import { diagonalCell as cell, diagonalButton as button, diagonalLines, diagonalWorkbook,
  openDiagonal, applyDiagonal } from '../support/diagonal-borders'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, diagonalWorkbook)
  await select(page, 'B2', '1:1'); await openDiagonal(page, 'diagonal', 'double'); await applyDiagonal(page)
})

for (const writer of ['copy-all', 'formats', 'painter'])
  test(`${writer} carries diagonals without overwriting neighbouring diagonal facts`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await select(page, 'D2', '1:3'); await openDiagonal(page, 'diagonal-up', 'thin', '#008000'); await applyDiagonal(page)
    await select(page, 'B2', '1:1')
    if (writer === 'painter') {
      await showRibbonControl(page, 'Format painter'); await button(page, 'Format painter').click()
      await cell(page, '1:2').click()
      await expect(page.getByLabel('Format painter status')).toContainText('Formatting applied.')
    } else {
      await copy(page); await select(page, 'C2', '1:2')
      await paste(page, writer === 'formats' ? 'Paste formatting only' : 'Paste')
    }
    await expect(diagonalLines(cell(page, '1:2'))).toHaveCount(4)
    await expect(cell(page, '1:2')).toHaveText(writer === 'copy-all' ? 'B2 kept' : 'C2 kept')
    await expect(cell(page, '1:3').locator('[data-diagonal="diagUp"]')).toHaveAttribute('stroke', '#008000')
    await button(page, 'Undo').click(); await expect(diagonalLines(cell(page, '1:2'))).toHaveCount(0)
    await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(4)
    await expect(cell(page, '1:3').locator('[data-diagonal="diagUp"]')).toHaveAttribute('stroke', '#008000')
    await button(page, 'Redo').click(); await expect(diagonalLines(cell(page, '1:2'))).toHaveCount(4)
  })

test('fill values-only clear formatting and repeat preserve diagonal transaction semantics', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await select(page, 'C2', '1:2'); await button(page, 'Repeat').click()
  await expect(diagonalLines(cell(page, '1:2'))).toHaveCount(4)
  await select(page, 'B2:B3', '1:1'); await showRibbonItem(page, 'data.fill-selected-range')
  await page.getByRole('combobox', { name: 'Fill selected range' }).selectOption('down')
  await expect(diagonalLines(cell(page, '2:1'))).toHaveCount(4)
  await button(page, 'Undo').click(); await expect(diagonalLines(cell(page, '2:1'))).toHaveCount(0)
  await expect(cell(page, '2:1')).toHaveText('B3 kept')
  await select(page, 'B2', '1:1'); await copy(page)
  await select(page, 'D2', '1:3'); await paste(page, 'Paste values only')
  await expect(cell(page, '1:3')).toHaveText('B2 kept')
  await expect(diagonalLines(cell(page, '1:3'))).toHaveCount(0)
  await select(page, 'B2', '1:1'); await showRibbonControl(page, 'Clear formatting')
  await button(page, 'Clear formatting').click()
  await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(0)
  await expect(cell(page, '1:1')).toHaveText('B2 kept')
  await button(page, 'Undo').click(); await expect(diagonalLines(cell(page, '1:1'))).toHaveCount(4)
})
