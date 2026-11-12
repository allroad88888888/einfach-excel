import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import {
  accountingButton as button, accountingCell as cell, accountingFormula as formula,
  applyAccounting, expectAccounting, expectAccountingSettings, openAccounting,
  setAccountingInput, startAccounting,
} from '../support/accounting-number-format'

test('native save and reopen restores accounting category symbol and decimal places', async ({ page }) => {
  await startAccounting(page)
  await setAccountingInput(page, 'E40', '39:4', '=-1234.5')
  const neighbor = await cell(page, '40:4').innerText()
  await openAccounting(page, 'E40', '39:4', '€', '3')
  await applyAccounting(page)
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const bytes = await readFile((await (await pending).path())!)
  expect(bytes.toString()).toContain('"accounting"')
  await button(page, 'Close').click()
  await button(page, 'General format').click()
  await expect(cell(page, '39:4')).toHaveText('-1234.5')
  await button(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Accounting.einfach.json', mimeType: 'application/json', buffer: bytes,
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await select(page, 'E40', '39:4')
  await expectAccounting(cell(page, '39:4'), '€', '(1,234.500)')
  await expect(formula(page)).toHaveValue('=-1234.5')
  await expectAccountingSettings(page, '€', '3')
  await expect(cell(page, '40:4')).toHaveText(neighbor)
  await expect(button(page, 'Undo')).toBeDisabled()
})
