import { expect, type Page } from '@playwright/test'
import { select } from './clipboard'
import { showRibbonItem } from './ribbon'

export const specialCell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const specialButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const specialFormula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value' })
export const specialDialog = (page: Page) => page.getByRole('dialog', { name: 'Number format', exact: true })
export const specialPreview = (page: Page) => page.getByRole('status', { name: 'Number format preview' })

export async function startSpecial(page: Page) {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(specialCell(page, '1:0')).toHaveText('SO-10001')
}

export async function setSpecialInput(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  await specialFormula(page).fill(value)
  await specialFormula(page).press('Enter')
  await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
}

export async function openSpecial(page: Page, address: string, coord: string,
  preset = 'zip-code', locale = 'en-US') {
  await select(page, address, coord)
  await showRibbonItem(page, 'format.number-format-settings')
  await specialButton(page, 'Number format settings').click()
  await page.getByLabel('Number format category').selectOption('special')
  await page.getByLabel('Locale (location)', { exact: true }).selectOption(locale)
  await page.getByLabel('Special format type', { exact: true }).selectOption(preset)
}

export async function applySpecial(page: Page) {
  await specialButton(page, 'Apply number format').click()
  await expect(specialDialog(page)).toHaveCount(0)
}

export async function expectSpecialSettings(page: Page, preset: string, locale = 'en-US') {
  await showRibbonItem(page, 'format.number-format-settings')
  await specialButton(page, 'Number format settings').click()
  await expect(page.getByLabel('Number format category')).toHaveValue('special')
  await expect(page.getByLabel('Locale (location)', { exact: true })).toHaveValue(locale)
  await expect(page.getByLabel('Special format type', { exact: true })).toHaveValue(preset)
  await specialButton(page, 'Cancel').click()
}
