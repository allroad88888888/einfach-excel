import { expect, type Page } from '@playwright/test'
export { select, copy, paste } from '../support/clipboard'

export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const formula = (page: Page) => page.getByRole('textbox', { name: 'Active cell value', exact: true })

export async function sheet(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
}

export async function edit(page: Page, value: string) {
  await formula(page).fill(value)
  await formula(page).press('Enter')
}

export async function start(page: Page) {
  await page.goto('/e2e/fixtures/cross-sheet-cut/')
  await expect(cell(page, '0:0')).toHaveText('4')
  await expect(button(page, 'Undo')).toBeDisabled()
}
