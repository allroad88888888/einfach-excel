import { expect, type Page } from '@playwright/test'
import { select } from './clipboard'

export const customCell = (page: Page, coord = '0:0') => page.locator(`td[data-cell="${coord}"]`)
export const customButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const customFormula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
export const customPreview = (page: Page) => page.getByRole('status', { name: 'Number format preview' })

export async function startCustomFormat(page: Page) {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(customCell(page, '1:0')).toHaveText('SO-10001')
  await customButton(page, 'New sheet').click()
}

export async function setCustomInput(page: Page, value: string, address = 'A1', coord = '0:0') {
  await select(page, address, coord)
  await customFormula(page).fill(value)
  await customFormula(page).press('Enter')
  await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
}

export async function openCustomFormat(page: Page, pattern: string) {
  await select(page, 'A1', '0:0')
  await customButton(page, 'Number format settings').click()
  await page.getByLabel('Number format category').selectOption('custom')
  await page.getByRole('textbox', { name: 'Format code', exact: true }).fill(pattern)
}

export async function applyCustomFormat(page: Page) {
  await customButton(page, 'Apply number format').click()
  await expect(page.getByRole('dialog', { name: 'Number format', exact: true })).toHaveCount(0)
}
