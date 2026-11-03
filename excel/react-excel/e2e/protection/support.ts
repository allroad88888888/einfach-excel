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

export async function expectLockedInput(page: Page) {
  const field = editor(page)
  await expect(field).not.toBeEditable()
  await expect(field).toBeEnabled()
  const value = await field.inputValue()
  await field.press('9')
  await expect(field).toHaveValue(value)
  await expect(page.locator('[data-cell-editor]')).toHaveCount(0)
}

export async function openProtectedDemo(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/?locale=en')
  await expect(page.getByRole('tab', { name: '整表只读', exact: true }))
    .toHaveAttribute('data-read-only', 'true')
}

export async function expectReadOnlyDemo(page: Page, name = '整表只读') {
  const tab = page.getByRole('tab', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('data-read-only', 'true')
  const box = page.getByRole('textbox', { name: 'Name box', exact: true })
  await box.fill('B6')
  await box.press('Enter')
  await expect(cell(page, '5:1')).toHaveText('2')
  await expectLockedInput(page)
  await expect(page.locator('[data-sheet-command-error]')).toHaveCount(0)
}
