import { expect, test, type Page } from '@playwright/test'
import { openDateFile } from '../support/conditional-dates'
import { button, cell, go } from '../support/date-filter'
import { showRibbonItem } from '../support/ribbon'

const fixture = Buffer.from(
  JSON.stringify({
    format: 'einfach-workbook',
    version: 1,
    title: 'Find by format',
    canvases: [{ rowCount: 25, colCount: 8 }],
    workbook: {
      version: 1,
      sheets: [{ idx: 0, name: 'Sheet1' }],
      cells: [
        { sheet: 0, row: 0, col: 0, addr: 'A1', kind: 'text', value: 'DRAFT' },
        { sheet: 0, row: 1, col: 0, addr: 'A2', kind: 'text', value: 'DRAFT' },
        { sheet: 0, row: 2, col: 0, addr: 'A3', kind: 'formula', value: '=10+5' },
        { sheet: 0, row: 0, col: 1, addr: 'B1', kind: 'text', value: 'Note' },
      ],
    },
  }),
)

async function launch(page: Page) {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, fixture)
  await expect(cell(page, '0:0')).toHaveText('DRAFT')
}

async function openFindDialog(page: Page, tab: 'Find' | 'Replace' = 'Find') {
  await showRibbonItem(page, 'view.find-and-replace')
  await button(page, 'Find and replace').click()
  const dialog = page.getByRole('dialog', { name: 'Find and replace', exact: true })
  await expect(dialog).toBeVisible()
  if (tab === 'Replace') {
    await dialog.getByRole('tab', { name: 'Replace', exact: true }).click()
  }
  return dialog
}

test('Find by format locates bold and fill-colored cells including styled blanks', async ({
  page,
}) => {
  await launch(page)
  // Format A1 and empty C3 with fill color (#fff2cc default quick fill) and bold
  await go(page, 'A1')
  await showRibbonItem(page, 'format.bold')
  await button(page, 'Bold').click()
  await showRibbonItem(page, 'format.fill-color')
  await button(page, 'Fill color').click()

  await go(page, 'C3')
  await showRibbonItem(page, 'format.bold')
  await button(page, 'Bold').click()
  await showRibbonItem(page, 'format.fill-color')
  await button(page, 'Fill color').click()

  // Sample A1 format and run Find all with empty needle
  await go(page, 'A1')
  const dialog = await openFindDialog(page, 'Find')
  await dialog.locator('summary').click()
  await dialog.locator('[data-find-format-group="find"]').getByRole('button', {
    name: 'From active cell',
    exact: true,
  }).click()

  await expect(dialog.getByLabel('Find bold', { exact: true })).toHaveValue('true')
  await expect(dialog.getByLabel('Find fill color', { exact: true })).toHaveValue('#fff2cc')

  await dialog.getByRole('button', { name: 'Find all', exact: true }).click()
  await expect(dialog.locator('.find-match')).toContainText('1 of 2 · Sheet1!A1')
  await dialog.getByRole('button', { name: 'Find next', exact: true }).click()
  await expect(dialog.locator('.find-match')).toContainText('2 of 2 · Sheet1!C3')
})

test('Replace format updates matched cells atomically with one undo step', async ({ page }) => {
  await launch(page)
  // Fill A1 and formula cell A3 with default fill color (#fff2cc)
  await go(page, 'A1')
  await showRibbonItem(page, 'format.fill-color')
  await button(page, 'Fill color').click()
  await go(page, 'A3')
  await showRibbonItem(page, 'format.fill-color')
  await button(page, 'Fill color').click()

  const dialog = await openFindDialog(page, 'Replace')
  await dialog.locator('summary').click()
  await dialog.getByLabel('Find fill color', { exact: true }).fill('#fff2cc')
  await dialog.getByLabel('Replace fill color', { exact: true }).fill('#dcfce7')
  await dialog.getByLabel('Replace bold', { exact: true }).selectOption('true')

  await dialog.getByRole('button', { name: 'Replace all', exact: true }).click()
  await expect(dialog).toContainText('Replaced 2 occurrence(s) in 2 cell(s)')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()

  // Values and formula result are preserved, styles updated to #dcfce7 + bold
  await expect(cell(page, '0:0')).toHaveText('DRAFT')
  await expect(cell(page, '2:0')).toHaveText('15')
  await expect(cell(page, '0:0')).toHaveCSS('background-color', 'rgb(220, 252, 231)')
  await expect(cell(page, '2:0')).toHaveCSS('background-color', 'rgb(220, 252, 231)')
  await expect(cell(page, '0:0')).toHaveCSS('font-weight', '700')

  // One undo restores both cells to #fff2cc and non-bold
  await button(page, 'Undo').click()
  await expect(cell(page, '0:0')).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await expect(cell(page, '2:0')).toHaveCSS('background-color', 'rgb(255, 242, 204)')
  await expect(cell(page, '0:0')).toHaveCSS('font-weight', '400')
})

test('Combined text and format find-replace filters matches and replaces both atomically', async ({
  page,
}) => {
  await launch(page)
  // Make only A1 italic (A2 also says "DRAFT" but is plain)
  await go(page, 'A1')
  await showRibbonItem(page, 'format.italic')
  await button(page, 'Italic').click()

  const dialog = await openFindDialog(page, 'Replace')
  await dialog.getByLabel('Find what', { exact: true }).fill('DRAFT')
  await dialog.getByLabel('Replace with', { exact: true }).fill('FINAL')
  await dialog.locator('summary').click()
  await dialog.getByLabel('Find italic', { exact: true }).selectOption('true')
  await dialog.getByLabel('Replace italic', { exact: true }).selectOption('false')
  await dialog.getByLabel('Replace bold', { exact: true }).selectOption('true')

  await dialog.getByRole('button', { name: 'Replace all', exact: true }).click()
  await expect(dialog).toContainText('Replaced 1 occurrence(s) in 1 cell(s)')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()

  await expect(cell(page, '0:0')).toHaveText('FINAL')
  await expect(cell(page, '1:0')).toHaveText('DRAFT')
  await expect(cell(page, '0:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '0:0')).toHaveCSS('font-style', 'normal')

  // One undo restores both text and italic formatting on A1
  await button(page, 'Undo').click()
  await expect(cell(page, '0:0')).toHaveText('DRAFT')
  await expect(cell(page, '0:0')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '0:0')).toHaveCSS('font-weight', '400')
})
