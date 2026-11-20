import { expect, test } from '@playwright/test'
import { downloadDateFile } from '../support/conditional-dates'
import { button, cell, go } from '../support/date-filter'
import { applySubtotal, launchSubtotal, openSubtotal } from '../support/subtotal'

test('Subtotal inserts native formulas and outlines with one undo step', async ({ page }) => {
  await launchSubtotal(page)
  const panel = await openSubtotal(page, 'A1')
  await expect(panel.getByLabel('List range', { exact: true })).toHaveValue('A1:C5')
  await expect(panel.getByRole('combobox', { name: 'At each change in', exact: true })).toHaveValue('0')
  await applySubtotal(page)
  await expect(cell(page, '3:0')).toHaveText('East Total')
  await expect(cell(page, '3:2')).toHaveText('5')
  await expect(cell(page, '6:2')).toHaveText('20')
  await expect(cell(page, '7:2')).toHaveText('25')
  await expect(cell(page, '11:7')).toHaveText('Independent text')
  const saved = JSON.parse((await downloadDateFile(page)).toString())
  expect(saved.canvases[0].rowCount).toBe(39)
  expect(saved.workbook.cells).toEqual(expect.arrayContaining([expect.objectContaining({
    sheet: 0, row: 7, col: 2, kind: 'formula', value: '=SUBTOTAL(9,C2:C6)',
  }), expect.objectContaining({
    sheet: 1, row: 0, col: 0, kind: 'formula', value: '=List!C5',
  })]))
  expect(saved.workbook.outlines[0].subtotalRegions).toHaveLength(1)
  await button(page, 'Show row outline level 1').click()
  await expect(cell(page, '1:0')).toHaveCount(0)
  await expect(cell(page, '7:2')).toHaveText('25')
  await button(page, 'Undo').click()
  await expect(cell(page, '1:0')).toHaveText('East')
  await button(page, 'Undo').click()
  await expect(button(page, 'Undo')).toBeDisabled()
  await expect(cell(page, '3:2')).toHaveText('4')
  await expect(cell(page, '8:7')).toHaveText('Independent text')
  await button(page, 'Redo').click()
  await go(page, 'A1')
  await expect(cell(page, '7:2')).toHaveText('25')
})

test('Subtotal appends inner groups and calculates grand totals from detail rows', async ({ page }) => {
  await launchSubtotal(page)
  await openSubtotal(page)
  await applySubtotal(page)
  const panel = await openSubtotal(page, 'A1')
  await panel.getByLabel('Replace current subtotals', { exact: true }).uncheck()
  await panel.getByRole('combobox', { name: 'At each change in', exact: true }).selectOption('1')
  await panel.getByRole('combobox', { name: 'Use function', exact: true }).selectOption('count')
  await applySubtotal(page)
  await expect(cell(page, '2:1')).toHaveText('Bags Total')
  await expect(cell(page, '4:1')).toHaveText('Pens Total')
  await expect(cell(page, '5:2')).toHaveText('5')
  await expect(cell(page, '11:2')).toHaveText('25')
  await expect(cell(page, '12:2')).toHaveText('4')
  await button(page, 'Undo').click()
  await expect(cell(page, '7:2')).toHaveText('25')
  await expect(cell(page, '8:2')).toHaveText('')
})
