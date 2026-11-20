import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { dateButton as button, dateCell as cell, openDateRules as openRules,
  openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'
import { stateMatches, type StateCondition } from '../support/conditional-cell-state'

test('external blank and error presets keep native types and scalar distinctions through XLSX', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  // Independent SpreadsheetML includes all four types, absent formulas and one conflicting formula.
  const bytes = await readFile(fileURLToPath(new URL('./conditional-cell-states.xlsx', import.meta.url)))
  await openFile(page, bytes, 'xlsx')
  const conditions: StateCondition[] = ['blank', 'not-blank', 'error', 'not-error']
  for (let pass = 0; pass < 2; pass++) {
    await select(page, 'A1', '0:0')
    for (const [col, condition] of conditions.entries()) {
      for (let row = 0; row < 12; row++) {
        if ((stateMatches[condition] as readonly number[]).includes(row))
          await expect(cell(page, `${row}:${col}`)).toHaveCSS('background-color', 'rgb(255, 199, 206)')
        else await expect(cell(page, `${row}:${col}`)).not.toHaveCSS('background-color', 'rgb(255, 199, 206)')
      }
    }
    await expect(cell(page, '0:4')).toHaveText('Neighbor')
    await expect(cell(page, '0:4')).not.toHaveCSS('background-color', 'rgb(255, 199, 206)')
    await openRules(page)
    await expect(page.getByRole('dialog', { name: 'Conditional formatting', exact: true }).getByRole('listitem'))
      .toHaveCount(4)
    for (const [index, condition] of conditions.entries()) {
      await button(page, `Edit rule ${index + 1}`).click()
      await expect(page.getByLabel('Rule type')).toHaveValue('cell-state')
      await expect(page.getByLabel('Cell condition')).toHaveValue(condition)
      await expect(page.getByLabel('Stop if true')).toBeChecked()
    }
    await button(page, 'Cancel').click()
    const native = JSON.parse((await downloadFile(page)).toString())
    expect(native.workbook.conditionalFormats[0].rules.every((entry: { rule: { kind: string } }) =>
      entry.rule.kind === 'cell-state')).toBe(true)
    if (pass === 0) await openFile(page, await downloadFile(page, true), 'xlsx')
  }
})
