import { expect, type Page } from '@playwright/test'
export { select } from '../support/clipboard'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const editor = (page: Page) => page.getByRole('textbox', { name: 'Active cell value', exact: true })
export const panel = (page: Page) => page.getByRole('dialog', { name: 'Worksheet protection', exact: true })

export async function openProtection(page: Page) {
  await button(page, 'Worksheet protection').click()
  await expect(panel(page)).toBeVisible()
  await expect(button(page, 'Protect worksheet').or(button(page, 'Unprotect worksheet'))).toBeEnabled()
}
export async function protect(page: Page) {
  await button(page, 'Protect worksheet').click()
  await expect(button(page, 'Unprotect worksheet')).toBeEnabled()
}
export async function closeProtection(page: Page) {
  await button(page, 'Close').click()
  await expect(panel(page)).toHaveCount(0)
}
export async function input(page: Page, value: string) {
  await editor(page).fill(value)
  await editor(page).press('Enter')
}
