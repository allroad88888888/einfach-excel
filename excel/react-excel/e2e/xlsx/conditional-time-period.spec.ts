import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { dateButton as button, dateCell as cell, openDateRules,
  openDateFile, downloadDateFile } from '../support/conditional-dates'

test('external date period rules import and reexport as editable types with real highlights', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  // Handwritten SpreadsheetML includes ten native periods, missing formulas and a conflicting formula.
  await openDateFile(page, await readFile(fileURLToPath(new URL('./conditional-dates.xlsx', import.meta.url))), 'xlsx')
  for (let pass = 0; pass < 2; pass++) {
    await select(page, 'A1', '0:0')
    for (const row of [0, 1]) await expect(cell(page, `${row}:0`)).toHaveCSS('background-color', 'rgb(255, 199, 206)')
    for (const row of [2, 3, 4, 5, 6]) await expect(cell(page, `${row}:0`)).not.toHaveCSS('background-color', 'rgb(255, 199, 206)')
    for (let row = 0; row < 9; row++) await expect(cell(page, `${row}:3`)).toHaveCSS('background-color', 'rgb(255, 199, 206)')
    await expect(cell(page, '0:1')).toHaveText('Neighbor')
    await expect(cell(page, '0:1')).not.toHaveCSS('background-color', 'rgb(255, 199, 206)')
    await openDateRules(page)
    const rows = page.getByRole('dialog', { name: 'Conditional formatting', exact: true }).getByRole('listitem')
    await expect(rows).toHaveCount(10)
    for (const [index, period] of ['today', 'yesterday', 'tomorrow', 'last7Days', 'thisWeek',
      'lastWeek', 'nextWeek', 'thisMonth', 'lastMonth', 'nextMonth'].entries()) {
      await button(page, `Edit rule ${index + 1}`).click()
      await expect(page.getByLabel('Rule type')).toHaveValue('time-period')
      await expect(page.getByLabel('Date period')).toHaveValue(period)
    }
    await button(page, 'Edit rule 1').click()
    await expect(page.getByLabel('Stop if true')).toBeChecked()
    await expect(page.getByLabel('Applies to')).toHaveValue('A1:A7, F1:F2')
    await button(page, 'Cancel').click()
    const native = JSON.parse((await downloadDateFile(page)).toString())
    expect(native.workbook.conditionalFormats[0].rules.every((entry: { rule: { kind: string } }) =>
      entry.rule.kind === 'time-period')).toBe(true)
    if (pass === 0) await openDateFile(page, await downloadDateFile(page, true), 'xlsx')
  }
  await select(page, 'A2', '1:0')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=TODAY()+0.75')
})
