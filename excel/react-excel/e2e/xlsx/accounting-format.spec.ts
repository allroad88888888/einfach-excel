import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
import {
  accountingButton as button, accountingCell as cell, accountingFormula as formula,
  applyAccounting, expectAccounting, expectAccountingSettings, openAccounting,
  setAccountingInput, startAccounting,
} from '../support/accounting-number-format'

async function openXlsx(page: Page, bytes: Buffer) {
  await button(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Accounting.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: bytes,
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
}

test('opening built-in accounting formats 41 through 44 preserves symbols parentheses and zero dashes', async ({ page }) => {
  await startAccounting(page)
  await openXlsx(page, await readFile(fileURLToPath(new URL('./accounting-builtins.xlsx', import.meta.url))))
  for (const [col, letter, symbol, digits] of [[0, 'A', '', '0'], [1, 'B', '$', '0'],
    [2, 'C', '', '2'], [3, 'D', '$', '2'], [4, 'E', '$', '2']] as const) {
    const numeric = digits === '0' ? '1,235' : '1,234.50'
    await select(page, `${letter}1`, `0:${col}`)
    await expectAccounting(cell(page, `0:${col}`), symbol, numeric)
    await expectAccounting(cell(page, `1:${col}`), symbol, `(${numeric})`)
    await expectAccounting(cell(page, `2:${col}`), symbol, '-')
    await expect(formula(page)).toHaveValue('1234.5')
    await expectAccountingSettings(page, symbol, digits)
  }
  await expect(cell(page, '0:5')).toHaveText('Neighbor')
  await button(page, 'General format').click()
  await expect(cell(page, '0:4')).toHaveText('1234.5')
  await button(page, 'Undo').click()
  await expectAccounting(cell(page, '0:4'), '$', '1,234.50')
  await button(page, 'Redo').click()
  await expect(cell(page, '0:4')).toHaveText('1234.5')
})

test('XLSX export and reopen preserves accounting category custom symbol and decimal places', async ({ page }) => {
  await startAccounting(page)
  await setAccountingInput(page, 'E40', '39:4', '=-1234.5')
  const neighbor = await cell(page, '40:4').innerText()
  const symbol = 'U";\\*'
  await openAccounting(page, 'E40', '39:4', symbol, '3')
  await applyAccounting(page)
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download as Excel (.xlsx)').click()
  const bytes = await readFile((await (await pending).path())!)
  await button(page, 'Close').click()
  await button(page, 'General format').click()
  await openXlsx(page, bytes)
  await select(page, 'E40', '39:4')
  await expectAccounting(cell(page, '39:4'), symbol, '(1,234.500)')
  await expect(formula(page)).toHaveValue('=-1234.5')
  await expectAccountingSettings(page, symbol, '3')
  await expect(cell(page, '40:4')).toHaveText(neighbor)
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('external quoted euro accounting opens named settings and preserves every numeric section', async ({ page }) => {
  await startAccounting(page)
  await openXlsx(page, await readFile(fileURLToPath(new URL('./accounting-external-euro.xlsx', import.meta.url))))
  await select(page, 'A1', '0:0')
  await expectAccounting(cell(page, '0:0'), '€', '1,234.50')
  await expectAccounting(cell(page, '1:0'), '€', '(1,234.50)')
  await expectAccounting(cell(page, '2:0'), '€', '-')
  await expectAccountingSettings(page, '€', '2')
  await expect(formula(page)).toHaveValue('1234.5')
  await button(page, 'Increase decimal places').click()
  await expectAccounting(cell(page, '0:0'), '€', '1,234.500')
  await expectAccountingSettings(page, '€', '3')
  await button(page, 'Undo').click()
  await expectAccounting(cell(page, '0:0'), '€', '1,234.50')
  await button(page, 'Redo').click()
  await expectAccounting(cell(page, '0:0'), '€', '1,234.500')
  await expectAccounting(cell(page, '1:0'), '€', '(1,234.50)')
  await expect(cell(page, '0:1')).toHaveText('Neighbor')
  await expect(formula(page)).toHaveValue('1234.5')
})
