import { expect, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, coordinate: string) => page.locator(`td[data-cell="${coordinate}"]`)
export const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value', exact: true })
export const validationDialog = (page: Page) => page.getByRole('dialog', { name: 'Data validation', exact: true })

export async function start(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'D45:D46', '44:3')
}

export async function configure(page: Page, options: {
  formula?: string; style?: 'stop' | 'warning' | 'information'; prompt?: boolean; range?: string
} = {}) {
  await button(page, 'Data validation').click()
  await expect(page.getByLabel('Allow', { exact: true })).toBeEnabled()
  if (options.range) await page.getByLabel('Applies to', { exact: true }).fill(options.range)
  await page.getByLabel('Allow', { exact: true }).selectOption('custom-formula')
  await page.getByLabel('Validation formula', { exact: true }).fill(options.formula ?? '=D45>0')
  await page.getByLabel('Error alert', { exact: true }).selectOption(options.style ?? 'stop')
  await page.getByLabel('Error title', { exact: true }).fill('Check quantity')
  await page.getByLabel('Error message', { exact: true }).fill('Enter a positive quantity.')
  if (options.prompt) {
    await page.getByLabel('Show input message when selected', { exact: true }).check()
    await page.getByLabel('Input title', { exact: true }).fill('Quantity')
    await page.getByLabel('Input message', { exact: true }).fill('Use a positive number.\n请输入正数。')
  }
  await button(page, 'Apply').click()
  await expect(validationDialog(page)).toHaveCount(0)
}

export async function edit(page: Page, address: string, coordinate: string, value: string) {
  await select(page, address, coordinate)
  await bar(page).fill(value); await bar(page).press('Enter')
}
