import { expect, test } from '@playwright/test'
import { downloadDateFile, openDateFile } from '../support/conditional-dates'
import { launch, go, open, apply, button, cell, dialog } from '../support/date-filter'

test('Table banded fill filters data independently of the total row', async ({ page }) => {
  await launch(page)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await go(page, 'B80')
  await expect(cell(page, '80:1')).toHaveCSS('background-color', 'rgb(217, 232, 245)')
  await expect(cell(page, '81:1')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await open(page, 'B', 'DemoTable')
  await button(page, 'Filter by color…').click()
  await button(page, 'Choose a color from this column').click()
  await expect(button(page, '#d9e8f5 (2 rows)')).toBeVisible()
  await expect(button(page, '#ffffff (1 row)')).toBeVisible()
  await button(page, '#d9e8f5 (2 rows)').click()
  await apply(page)
  await expect(cell(page, '81:0')).toHaveCount(0)
  await expect(cell(page, '80:0')).toHaveText('Keyboard')
  await expect(cell(page, '82:0')).toHaveText('Monitor')
  await expect(cell(page, '83:1')).toHaveText('40')
  await button(page, 'Undo').click()
  await expect(cell(page, '81:0')).toHaveText('Mouse')
  await expect(cell(page, '83:1')).toHaveText('60')
  await button(page, 'Redo').click()
  await expect(cell(page, '81:0')).toHaveCount(0)
  const bytes = await downloadDateFile(page)
  const saved = JSON.parse(bytes.toString()).workbook.tables.find((table: { name: string }) =>
    table.name === 'DemoTable').autoFilter
  expect(saved).toMatchObject({
    rules: [{ kind: 'color', colIndex: 1, source: 'fill', color: '#d9e8f5' }], hiddenRows: [81],
  })
  await openDateFile(page, bytes)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await go(page, 'B80')
  await expect(cell(page, '81:0')).toHaveCount(0)
  await expect(cell(page, '83:1')).toHaveText('40')
  await open(page, 'B', 'DemoTable')
  await expect(dialog(page).getByLabel('RGB color 1', { exact: true })).toHaveValue('#d9e8f5')
})
