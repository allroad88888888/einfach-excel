import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import { addAverageRule } from '../support/conditional-average'
import { dateButton as button, dateCell as cell, openDateFile as openFile,
  downloadDateFile as downloadFile } from '../support/conditional-dates'

const green = 'rgb(0, 255, 0)'

async function openNumbers(page: Page, values: (number | string | boolean)[]) {
  const cells = values.map((value, col) => ({ sheet: 0, row: 0, col,
    addr: `${String.fromCharCode(65 + col)}1`, value,
    kind: typeof value === 'string' ? (value.startsWith('=') ? 'formula' : 'text') : typeof value }))
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await openFile(page, Buffer.from(JSON.stringify({ format: 'einfach-workbook', version: 1,
    title: 'Review mean numbers', canvases: [{ rowCount: 30, colCount: 8 }],
    workbook: { version: 1, sheets: [{ idx: 0, name: 'Numbers' }], cells } })))
  await select(page, 'A1', '0:0')
}

test('average preserves a small residual after extreme positive and negative numbers cancel', async ({ page }) => {
  const values = [2 ** 1023, 2 ** -100, -(2 ** 1023), 0]
  // All inputs and the exact mean 2^-102 are representable f64 values.
  // 0 is strictly below that mean; no epsilon or decimal rounding is involved.
  await openNumbers(page, values)
  await addAverageRule(page, 'A1:D1', 'below')
  const bytes = await downloadFile(page)
  const native = JSON.parse(bytes.toString())
  await test.info().attach('wide-exponents-native.json', {
    body: bytes, contentType: 'application/json',
  })
  const stored = native.workbook.cells.slice(0, 4)
    .map((entry: { value: number }) => entry.value)
  expect(stored).toEqual(values)
  await expect(cell(page, '0:2')).toHaveCSS('background-color', green)
  await expect(cell(page, '0:0')).not.toHaveCSS('background-color', green)
  await expect(cell(page, '0:1')).not.toHaveCSS('background-color', green)
  await page.screenshot({ path: test.info().outputPath('wide-exponents.png') })
  await expect(cell(page, '0:3'), 'zero must be below the positive mean 2^-102')
    .toHaveCSS('background-color', green)
  await button(page, 'Undo').click()
  await expect(cell(page, '0:3')).not.toHaveCSS('background-color', green)
  await button(page, 'Redo').click()
  await expect(cell(page, '0:3')).toHaveCSS('background-color', green)
})
