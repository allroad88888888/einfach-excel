import { expect, type Page } from '@playwright/test'

export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export async function start(page: Page, query = '') {
  await page.goto(`/e2e/fixtures/host-api/index.html${query}`)
  await expect(page.locator('.workbook[data-runtime-state="ready"]')).toBeVisible()
  if (!query) await expect(cell(page, '0:0')).toHaveText('Main')
}
export async function call(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Host controls' }).getByRole('button', { name: label, exact: true }).click()
  const output = page.getByLabel('API result')
  await expect(output).not.toHaveText('pending')
  const result = JSON.parse((await output.textContent())!)
  expect(result.failure).toBeUndefined()
  return result
}
export async function ok(page: Page, label: string) {
  const result = await call(page, label)
  expect(result, label).toMatchObject({ status: 'ok' })
  expect(result.displayError, label).toBeUndefined()
  return result
}
