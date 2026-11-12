import { expect, type Locator, type Page } from '@playwright/test'
import { select } from './clipboard'

export const accountingCell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const accountingButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const accountingFormula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
export const accountingDialog = (page: Page) => page.getByRole('dialog', { name: 'Number format', exact: true })
export const accountingPreview = (page: Page) => page.getByRole('status', { name: 'Number format preview' })

export async function startAccounting(page: Page) {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(accountingCell(page, '1:0')).toHaveText('SO-10001')
}

export async function setAccountingInput(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await accountingFormula(page).fill(value)
  await accountingFormula(page).press('Enter')
  await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
}

export async function openAccounting(page: Page, address: string, coord: string, symbol = '$', digits = '2') {
  await select(page, address, coord)
  await accountingButton(page, 'Number format settings').click()
  await page.getByLabel('Number format category').selectOption('accounting')
  await page.getByLabel('Currency symbol').fill(symbol)
  await page.getByLabel('Decimal places', { exact: true }).fill(digits)
}

export async function applyAccounting(page: Page) {
  await accountingButton(page, 'Apply number format').click()
  await expect(accountingDialog(page)).toHaveCount(0)
}

export async function expectAccounting(target: Locator, symbol: string, number: string) {
  await expect(target.locator('.cell-fill-start')).toHaveText(symbol, { useInnerText: true })
  await expect(target.locator('.cell-fill-end')).toHaveText(number, { useInnerText: true })
}

export async function expectAccountingSettings(page: Page, symbol: string, digits: string) {
  await accountingButton(page, 'Number format settings').click()
  await expect(page.getByLabel('Number format category')).toHaveValue('accounting')
  await expect(page.getByLabel('Currency symbol')).toHaveValue(symbol)
  await expect(page.getByLabel('Decimal places', { exact: true })).toHaveValue(digits)
  await accountingButton(page, 'Cancel').click()
}
