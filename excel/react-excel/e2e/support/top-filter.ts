import { expect, type Page } from '@playwright/test'
import { select } from './clipboard'
import { showRibbonItem } from './ribbon'

export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const menu = (page: Page) => page.getByRole('combobox', { name: 'Worksheet filter' })
export const records = ['Exclude 100', 'Keep 90 A', 'Keep 90 B', 'Keep 80', 'Keep text', 'Keep blank', 'Keep 70']
export const dialog = (page: Page) => page.getByRole('dialog', { name: /filter conditions$/i })

export async function start(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/e2e/fixtures/top-filter/?plugins=data-filter&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'E2:F9', '1:4')
}
export async function enable(page: Page) {
  await select(page, 'E2:F9', '1:4')
  await showRibbonItem(page, 'data.worksheet-filter')
  await menu(page).selectOption('selection')
  await expect(button(page, 'Filter column F')).toHaveAttribute('data-filtered', 'false')
}
export async function open(page: Page, column = 'F', table = '') {
  const more = page.locator('[data-ribbon-more][aria-expanded="true"]')
  if (await more.count()) await more.click()
  await button(page, `Filter ${table ? `${table} ` : ''}column ${column}`).click()
  await expect(dialog(page)).toBeVisible()
}
export async function rank(page: Page, amount = '2', direction = 'top', unit = 'items', index = 1) {
  const condition = dialog(page).getByLabel(`Filter condition ${index}`, { exact: true }).locator('..')
  const activate = condition.getByRole('button', { name: 'Top / Bottom…', exact: true })
  if (await activate.count()) await activate.click()
  await dialog(page).getByLabel(`Rank direction ${index}`, { exact: true }).selectOption(direction)
  await dialog(page).getByLabel(`Rank unit ${index}`, { exact: true }).selectOption(unit)
  await dialog(page).getByLabel(`Rank amount ${index}`, { exact: true }).fill(amount)
}
export async function apply(page: Page) {
  await dialog(page).getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
}
export async function visible(page: Page, offsets: readonly number[]) {
  await select(page, 'E2', '1:4')
  await expect(cell(page, '1:4')).toHaveText('Rank record')
  for (const [offset, text] of records.entries()) {
    if (offsets.includes(offset)) await expect(cell(page, `${2 + offset}:4`)).toHaveText(text)
    else await expect(cell(page, `${2 + offset}:4`)).toHaveCount(0)
  }
  await expect(cell(page, '0:1')).toHaveText('79')
}
export async function undoRedo(page: Page, offsets: readonly number[]) {
  await visible(page, offsets)
  await button(page, 'Undo').click()
  await visible(page, [0, 1, 2, 3, 4, 5, 6])
  await button(page, 'Recent operations').click()
  await expect(page.getByRole('dialog')).toContainText('1 undo · 1 redo')
  await button(page, 'Close history').click()
  await button(page, 'Redo').click()
  await visible(page, offsets)
}
