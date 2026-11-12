import { expect, type Page } from '@playwright/test'
import { select } from './clipboard'

export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const panel = (page: Page) => page.getByRole('dialog', { name: 'Fill series', exact: true })
export const handle = (page: Page) => button(page, 'Drag to fill')
export async function start(page: Page) {
  await page.goto('/?locale=en')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
}
export async function open(page: Page) {
  await select(page, 'D55:D58', '54:3')
  await button(page, 'Fill series').click()
  await panel(page).getByLabel('Sequence type').selectOption('custom-list')
}
export async function save(page: Page, items = 'Low\nMedium\nHigh', name = 'Priority') {
  await panel(page).getByLabel('List name', { exact: true }).fill(name)
  await panel(page).getByLabel('Custom list items').fill(items)
  await panel(page).getByRole('button', { name: 'Save list', exact: true }).click()
  await expect(panel(page).getByRole('status')).toHaveText('List saved.')
}
export async function close(page: Page) {
  await panel(page).getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
}
export async function begin(page: Page, address: string, coord = '55:3') {
  await select(page, address, coord)
  await handle(page).hover()
  await page.mouse.down()
}
export async function move(page: Page, coord: string) {
  await cell(page, coord).scrollIntoViewIfNeeded()
  const box = (await cell(page, coord).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByTestId('fill-preview')).toBeVisible()
}
export async function finish(page: Page) {
  await page.mouse.up()
  await expect(page.getByTestId('fill-preview')).toHaveCount(0)
  await expect(page.getByLabel('Fill status')).toContainText('Filled')
}
export async function drag(page: Page, address: string, destination: string, coord = '55:3') {
  await begin(page, address, coord)
  await move(page, destination)
  await finish(page)
}
export async function write(page: Page, address: string, coord: string, value: string) {
  await select(page, address, coord)
  const editor = page.getByRole('textbox', { name: 'Active cell value' })
  await editor.fill(value)
  await editor.press('Enter')
}
