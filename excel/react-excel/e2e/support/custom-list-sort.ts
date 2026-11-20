import { expect, type Page } from '@playwright/test'
import { select } from './clipboard'
import { showRibbonItem } from './ribbon'

export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const panel = (page: Page) => page.getByRole('dialog', { name: 'Custom list sort', exact: true })
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const original = ['W20', 'E10', 'W10', 'E30']

export async function start(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 850 })
  await page.goto('/?plugins=data-sort&locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
}
export async function save(page: Page, name = 'Team order', values = 'West\nEast') {
  await select(page, 'E55:E59', '54:4')
  await showRibbonItem(page, 'data.fill-series')
  await button(page, 'Fill series').click()
  const fill = page.getByRole('dialog', { name: 'Fill series', exact: true })
  await fill.getByLabel('Sequence type').selectOption('custom-list')
  await fill.getByLabel('List name', { exact: true }).fill(name)
  await fill.getByLabel('Custom list items').fill(values)
  await fill.getByRole('button', { name: 'Save list', exact: true }).click()
  await expect(fill.getByRole('status')).toHaveText('List saved.')
  await fill.getByRole('button', { name: 'Cancel', exact: true }).click()
}
export async function open(page: Page, range = 'A25:C29', coord = '24:0') {
  await select(page, range, coord)
  await showRibbonItem(page, 'data.custom-list-sort')
  await button(page, 'Custom list sort').click()
  await expect(panel(page)).toBeVisible()
}
export async function configure(page: Page, name = 'Team order') {
  await panel(page).getByLabel('First row is a header').check()
  await panel(page).getByLabel('Sort list 1', { exact: true }).selectOption(`user:${name}`)
}
export async function apply(page: Page) {
  await panel(page).getByRole('button', { name: 'Apply sort', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
}
export async function records(page: Page, values: readonly string[], start = 25, column = 2) {
  for (const [index, value] of values.entries())
    await expect(cell(page, `${start + index}:${column}`)).toHaveText(value)
}
export async function history(page: Page, values: readonly string[]) {
  await records(page, values)
  await expect(cell(page, '24:0')).toHaveText('Team')
  await expect(cell(page, '24:3')).toHaveText('')
  await button(page, 'Undo').click()
  await records(page, original)
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await records(page, values)
}
