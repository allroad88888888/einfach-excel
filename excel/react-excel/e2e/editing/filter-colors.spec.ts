import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'
import { openDateRules, downloadDateFile, openDateFile } from '../support/conditional-dates'
import { launchColors, chooseColor, visibleColorRecords } from '../support/color-filter'
import { apply, open, go, button, cell, dialog, menu } from '../support/date-filter'

test('Cell color filter keeps solid matches including blanks in one undo step', async ({ page }) => {
  await launchColors(page)
  await chooseColor(page, 'fill')
  await expect(cell(page, '1:0')).toHaveCSS('background-color', 'rgb(192, 0, 0)')
  await expect(cell(page, '2:0')).toHaveCSS('background-image', /data:image/)
  await button(page, 'Choose a color from this column').click()
  await expect(button(page, '#c00000 (2 rows)')).toBeVisible()
  await button(page, '#c00000 (2 rows)').click()
  await apply(page)
  await visibleColorRecords(page, [1, 4])
  await expect(cell(page, '4:0')).toHaveText('')
  await button(page, 'Undo').click()
  await visibleColorRecords(page, [1, 2, 3, 4, 5, 6, 7])
  await button(page, 'Redo').click()
  await visibleColorRecords(page, [1, 4])
})

test('No fill excludes explicit white and patterned cells', async ({ page }) => {
  await launchColors(page)
  await chooseColor(page, 'fill')
  await expect(button(page, 'No fill')).toHaveAttribute('aria-pressed', 'true')
  await apply(page)
  await visibleColorRecords(page, [5, 6, 7])
})

test('Font color matches rich-text runs and number-section colors', async ({ page }) => {
  await launchColors(page)
  await chooseColor(page, 'font')
  await expect(cell(page, '5:0').locator('.cell-content > span')).toHaveCount(3)
  await button(page, 'Choose a color from this column').click()
  await button(page, '#ff0000 (2 rows)').click()
  await apply(page)
  await visibleColorRecords(page, [2, 5])
  await chooseColor(page, 'font')
  await button(page, 'Automatic font color').click()
  await apply(page)
  await visibleColorRecords(page, [4, 6])
})

test('Conditional color is sampled when Apply or Reapply runs', async ({ page }) => {
  await launchColors(page)
  await select(page, 'A8', '7:0')
  await openDateRules(page)
  await page.getByLabel('Value', { exact: true }).fill('10')
  await page.getByLabel('Highlight fill', { exact: true }).fill('#008000')
  await button(page, 'Add rule').click()
  await expect(cell(page, '7:0')).toHaveCSS('background-color', 'rgb(0, 128, 0)')
  await chooseColor(page, 'fill', '#008000')
  await apply(page)
  await visibleColorRecords(page, [7])
  await go(page, 'A8')
  await cell(page, '7:0').dblclick()
  const editor = page.getByRole('textbox', { name: 'Cell editor', exact: true })
  await editor.fill('1')
  await editor.press('Enter')
  await expect(cell(page, '7:1')).toHaveText('Threshold')
  await showRibbonItem(page, 'data.worksheet-filter')
  await menu(page).selectOption('reapply')
  await visibleColorRecords(page, [])
  await button(page, 'Undo').click()
  await visibleColorRecords(page, [7])
  await expect(cell(page, '7:0')).toHaveText('1')
  await button(page, 'Redo').click()
  await visibleColorRecords(page, [])
})

test('Native file keeps the color rule and visibility with the plugin absent', async ({ page }) => {
  await launchColors(page)
  await chooseColor(page, 'fill', '#c00000')
  await apply(page)
  const bytes = await downloadDateFile(page)
  expect(JSON.parse(bytes.toString()).workbook.filters[0]).toMatchObject({
    rules: [{ kind: 'color', colIndex: 0, source: 'fill', color: '#c00000' }],
    hiddenRows: [2, 3, 5, 6, 7],
  })
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openDateFile(page, bytes)
  await visibleColorRecords(page, [1, 4])
  await open(page, 'A')
  await expect(button(page, 'Filter by color…')).toHaveCount(0)
  await expect(dialog(page)).toContainText('This saved condition is preserved. Enable its plugin to edit it.')
  await apply(page)
  await visibleColorRecords(page, [1, 4])
})
