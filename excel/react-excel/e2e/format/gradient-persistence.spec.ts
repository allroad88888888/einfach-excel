import { expect, test } from '@playwright/test'
import { copy, paste, select } from '../support/clipboard'
import { showRibbonControl, showRibbonItem } from '../support/ribbon'
import { openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { cell, button, gradientWorkbook, openGradient, applyGradient, nativeWorkbook, nativeFormat } from '../support/gradient-fill'

test.beforeEach(async ({ page }) => {
  await page.goto('/?plugins=cell-appearance')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, gradientWorkbook)
})

for (const writer of ['copy-all', 'formats', 'painter'])
test(`${writer} carries a blank rectangular gradient including every middle stop`, async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await select(page, 'B2', '1:1'); await openGradient(page, 'path-gradient'); await applyGradient(page)
  const source = await nativeFormat(page)
  const before = await nativeWorkbook(page)
  if (writer === 'painter') {
    await showRibbonControl(page, 'Format painter'); await button(page, 'Format painter').click()
    await cell(page, '1:2').click()
    await expect(page.getByLabel('Format painter status')).toContainText('Formatting applied.')
  } else {
    await copy(page); await select(page, 'C2', '1:2')
    await paste(page, writer === 'formats' ? 'Paste formatting only' : 'Paste')
  }
  expect(await nativeFormat(page, 'C2')).toMatchObject(source)
  await expect(cell(page, '1:2')).toHaveText(writer === 'copy-all' ? '' : 'C2 kept')
  expect(await nativeFormat(page, 'D2')).toEqual(before.formats.flatMap((f: { cellStyles: unknown[] }) => f.cellStyles)
    .find((f: { addr: string }) => f.addr === 'D2').format)
  await button(page, 'Undo').click(); expect(await nativeWorkbook(page)).toEqual(before)
  await button(page, 'Redo').click(); expect(await nativeFormat(page, 'C2')).toMatchObject(source)
})

test('repeat fill and clear formatting preserve gradient transactions and formulas across native reopen', async ({ page }) => {
  await select(page, 'B2', '1:1'); await openGradient(page, 'path-gradient'); await applyGradient(page)
  const source = await nativeFormat(page)
  await select(page, 'C2', '1:2'); await button(page, 'Repeat').click()
  expect(await nativeFormat(page, 'C2')).toMatchObject(source)
  await select(page, 'B2:B3', '1:1'); await showRibbonItem(page, 'data.fill-selected-range')
  await page.getByRole('combobox', { name: 'Fill selected range' }).selectOption('down')
  expect(await nativeFormat(page, 'B3')).toMatchObject(source)
  await button(page, 'Undo').click(); await expect(cell(page, '2:1')).toHaveText('B3 kept')
  await select(page, 'B2', '1:1'); await showRibbonControl(page, 'Clear formatting')
  await button(page, 'Clear formatting').click(); await expect(cell(page, '1:1')).toHaveCSS('background-image', 'none')
  await button(page, 'Undo').click(); expect(await nativeFormat(page)).toEqual(source)
  const before = await nativeWorkbook(page)
  await openFile(page, await downloadFile(page))
  expect(await nativeWorkbook(page)).toEqual(before)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('sparse row gradient and explicit cell no-fill survive Excel reopening without axis expansion', async ({ page }) => {
  await page.getByRole('button', { name: 'Select row 3', exact: true }).click()
  await openGradient(page, 'path-gradient'); await applyGradient(page)
  await select(page, 'B3', '2:1')
  await showRibbonItem(page, 'format.fill-color-palette'); await button(page, 'Choose fill color').click()
  await button(page, 'No fill').click()
  const before = await nativeWorkbook(page)
  const range = before.formats.find((f: { rowStyles?: unknown[] }) => f.rowStyles?.length)
  expect(range.rowStyles).toHaveLength(1)
  expect(range.cellStyles.length).toBeLessThan(8)
  await openFile(page, await downloadFile(page, true), 'xlsx')
  await expect(cell(page, '2:1')).toHaveCSS('background-image', 'none')
  await expect(cell(page, '2:0')).toHaveCSS('background-image', /data:image\/svg\+xml/)
  await expect(cell(page, '2:3')).toHaveCSS('background-image', /data:image\/svg\+xml/)
  await expect(cell(page, '2:1')).toHaveText('B3 kept')
})
