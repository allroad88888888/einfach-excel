import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { dateButton as button, dateCell as cell, openDateRules as openRules,
  openDateFile as openFile, downloadDateFile as downloadFile } from '../support/conditional-dates'

test('external average types import and reexport with direction equality and native highlights', async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  // Independent SpreadsheetML has omitted/default attributes and an intentionally conflicting formula.
  await openFile(page, await readFile(fileURLToPath(new URL('./conditional-averages.xlsx', import.meta.url))), 'xlsx')
  for (let pass = 0; pass < 2; pass++) {
    await select(page, 'A1', '0:0')
    for (let col = 0; col < 4; col++) {
      const matches = [[2], [0], [1, 2], [0, 1]][col]
      for (let row = 0; row < 6; row++) {
        if (matches.includes(row)) await expect(cell(page, `${row}:${col}`)).toHaveCSS('background-color', 'rgb(255, 199, 206)')
        else await expect(cell(page, `${row}:${col}`)).not.toHaveCSS('background-color', 'rgb(255, 199, 206)')
      }
    }
    await expect(cell(page, '0:4')).toHaveText('Neighbor')
    await expect(cell(page, '0:4')).not.toHaveCSS('background-color', 'rgb(255, 199, 206)')
    await openRules(page)
    await expect(page.getByRole('dialog', { name: 'Conditional formatting', exact: true }).getByRole('listitem')).toHaveCount(4)
    for (let index = 0; index < 4; index++) {
      await button(page, `Edit rule ${index + 1}`).click()
      await expect(page.getByLabel('Rule type')).toHaveValue('above-average')
      await expect(page.getByLabel('Average comparison')).toHaveValue(index % 2 ? 'below' : 'above')
      await expect(page.getByLabel('Include equal average')).toBeChecked({ checked: index >= 2 })
    }
    await expect(page.getByLabel('Stop if true')).toBeChecked()
    await button(page, 'Cancel').click()
    const native = JSON.parse((await downloadFile(page)).toString())
    expect(native.workbook.conditionalFormats[0].rules.every((entry: { rule: { kind: string } }) =>
      entry.rule.kind === 'above-average')).toBe(true)
    if (pass === 0) await openFile(page, await downloadFile(page, true), 'xlsx')
  }
})
