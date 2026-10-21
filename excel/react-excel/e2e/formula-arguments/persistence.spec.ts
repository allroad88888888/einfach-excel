import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { bar, button, cell, commitArguments, download, field, neighbors, openArguments, openFile } from './fixtures'

test('argument-generated native formulas survive workbook download and reopening as editable formulas', async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001'); await select(page, 'B3', '2:1')
  await openArguments(page, 'LET')
  await field(page, 'name').fill('x'); await field(page, 'value').fill('E3')
  await field(page, 'calculation').fill('x*F3')
  await commitArguments(page, '=LET(x,E3,x*F3)', '658')
  const file = await download(page)
  expect(file.workbook.cells.find((entry: { sheet: number; row: number; col: number }) =>
    entry.sheet === 0 && entry.row === 2 && entry.col === 1))
    .toMatchObject({ kind: 'formula', value: '=LET(x,E3,x*F3)' })
  await button(page, 'Undo').click(); await expect(cell(page)).toHaveText('Northwind')
  await openFile(page, file); await select(page, 'B3', '2:1')
  await expect(cell(page)).toHaveText('658'); await expect(bar(page)).toHaveValue('=LET(x,E3,x*F3)')
  await expect(button(page, 'Undo')).toBeDisabled(); await neighbors(page)
})
