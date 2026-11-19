import { expect, test } from '@playwright/test'
import { downloadDateFile, openDateFile } from '../support/conditional-dates'
import { button, cell, go } from '../support/date-filter'
import { sheetMenuItem } from '../support/sheet-menu'
import { checkRecords, launchCriteria, openCriteria, reapplyCriteria } from '../support/worksheet-criteria'

const allRows = [1, 2, 3, 4, 5, 6, 7]

test('Worksheet criteria combine repeated headings and alternative rows', async ({ page }) => {
  await launchCriteria(page)
  const dialog = await openCriteria(page)
  await dialog.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await checkRecords(page, [1, 2, 4, 6])
  await button(page, 'Undo').click()
  await checkRecords(page, allRows)
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await checkRecords(page, [1, 2, 4, 6])
})

test('Worksheet formula criteria reapply from edited cells and undo restores visibility', async ({ page }) => {
  await launchCriteria(page)
  const dialog = await openCriteria(page, "'Filter Rules'!E1:E2")
  await dialog.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await checkRecords(page, [1, 2, 3, 5, 7])
  await page.getByRole('tab', { name: 'Filter Rules', exact: true }).click()
  await go(page, 'H1')
  await cell(page, '0:7').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('9')
  await editor.press('Enter')
  await expect(cell(page, '0:7')).toHaveText('9')
  await page.getByRole('tab', { name: 'Source records', exact: true }).click()
  await checkRecords(page, [1, 2, 3, 5, 7])
  await reapplyCriteria(page)
  await checkRecords(page, [3])
  await button(page, 'Undo').click()
  await checkRecords(page, [1, 2, 3, 5, 7])
})

test('Native reopening restores worksheet criteria and allows reapply without the plugin', async ({ page }) => {
  await launchCriteria(page)
  const dialog = await openCriteria(page)
  await dialog.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const saved = await downloadDateFile(page)
  expect(JSON.parse(saved.toString()).workbook.filters[0]).toMatchObject({
    sheet: 0, hiddenRows: [3, 5, 7], rules: [],
    rangeCriteria: { criteria: { kind: 'range', reference: { sheet: 1 } }, uniqueOnly: false },
  })
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, saved)
  await checkRecords(page, [1, 2, 4, 6])
  await expect(button(page, 'Advanced filter')).toHaveCount(0)
  await reapplyCriteria(page)
  await checkRecords(page, [1, 2, 4, 6])
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('Native download and reopen preserve the filtered snapshot after deleting its criteria sheet', async ({ page }) => {
  await launchCriteria(page)
  const dialog = await openCriteria(page)
  await dialog.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const rulesSheet = page.getByRole('tab', { name: 'Filter Rules', exact: true })
  await rulesSheet.click()
  await (await sheetMenuItem(page, 'Delete sheet')).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete worksheet', exact: true }).click()
  await expect(rulesSheet).toHaveCount(0)
  await page.getByRole('tab', { name: 'Source records', exact: true }).click()
  await checkRecords(page, [1, 2, 4, 6])
  const saved = await downloadDateFile(page)
  const file = JSON.parse(saved.toString())
  expect(file.canvases).toHaveLength(2)
  expect(file.workbook.filters[0]).toMatchObject({
    sheet: 0, hiddenRows: [3, 5, 7], rangeCriteria: { criteria: { kind: 'missing' } },
  })
  await button(page, 'Undo').click()
  await expect(rulesSheet).toBeVisible()
  await openDateFile(page, saved)
  await expect(rulesSheet).toHaveCount(0)
  await checkRecords(page, [1, 2, 4, 6])
  await reapplyCriteria(page)
  await expect(page.getByRole('alert')).toContainText('criteria range was removed')
  await checkRecords(page, [1, 2, 4, 6])
})

test('Invalid criteria preserve visible records and the redo stack', async ({ page }) => {
  await launchCriteria(page)
  const valid = await openCriteria(page)
  await valid.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(valid).toHaveCount(0)
  await button(page, 'Undo').click()
  await checkRecords(page, allRows)
  const dialog = await openCriteria(page, "'Filter Rules'!A1")
  await dialog.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Choose a criteria range')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await checkRecords(page, allRows)
  await button(page, 'Redo').click()
  await checkRecords(page, [1, 2, 4, 6])
})
