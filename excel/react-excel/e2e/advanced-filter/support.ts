import { expect, type Page } from '@playwright/test'
import { select } from '../support/clipboard'
export { select }

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, row: number, col = 2) => page.locator(`td[data-cell="${row}:${col}"]`)
export const menu = (page: Page) => page.getByRole('combobox', { name: 'Worksheet filter' })
export const dialog = (page: Page) => page.getByRole('dialog', { name: 'Filter conditions', exact: true })
export const valuesPage = (page: Page) => page.getByLabel('Filter values page', { exact: true })
export const choice = (page: Page, value: string) => page.getByRole('checkbox', { name: `Select value ${value}`, exact: true })

export async function summary(page: Page) {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, 1, 0)).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A25:C29', '24:0')
  await menu(page).selectOption('selection')
  await open(page)
}
export async function open(page: Page) {
  await menu(page).selectOption('open')
  await expect(dialog(page)).toBeVisible()
}
export async function field(page: Page, index: number, value: string, col?: number) {
  if (col !== undefined) await dialog(page).getByLabel(`Filter column ${index}`, { exact: true }).selectOption(String(col))
  await dialog(page).getByLabel(`Filter value ${index}`, { exact: true }).fill(value)
}
export async function alternatives(page: Page) {
  await field(page, 1, 'West', 0)
  await button(page, 'Add OR group').click()
  await field(page, 2, 'East', 0)
}
export async function minimum(page: Page, index: number, value: string) {
  await dialog(page).getByLabel(`Filter column ${index}`, { exact: true }).selectOption('1')
  await dialog(page).getByLabel(`Filter condition ${index}`, { exact: true }).selectOption('range')
  await dialog(page).getByLabel(`Minimum ${index}`, { exact: true }).fill(value)
}
export async function apply(page: Page) {
  await button(page, 'Apply filter').click()
  await expect(dialog(page)).toHaveCount(0)
}
export async function records(page: Page, shown: string[]) {
  for (const [offset, value] of ['W20', 'E10', 'W10', 'E30'].entries()) {
    if (shown.includes(value)) await expect(cell(page, 25 + offset)).toHaveText(value)
    else await expect(cell(page, 25 + offset)).toHaveCount(0)
  }
  await expect(cell(page, 24, 0)).toHaveText('Team')
  await expect(cell(page, 0, 1)).toHaveText('79')
}
export async function undoRedo(page: Page, before: string[], after: string[]) {
  await button(page, 'Undo').click(); await records(page, before)
  await button(page, 'Redo').click(); await records(page, after)
}
export async function orders(page: Page) {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, 1, 0)).toHaveText('SO-10001')
  await select(page, 'A1:H1001', '0:0')
  await menu(page).selectOption('selection')
  await button(page, 'Filter column A').click()
  await button(page, 'Choose values for condition 1').click()
  await expect(valuesPage(page)).toHaveText('1–50 of 1000')
}
export async function search(page: Page, text: string) {
  await page.getByRole('searchbox', { name: 'Search filter values' }).fill(text)
  await button(page, 'Search').click()
}
