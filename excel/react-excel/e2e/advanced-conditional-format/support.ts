import { expect, type Page } from '@playwright/test'
import { paste, select } from '../support/clipboard'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, coordinate: string) => page.locator(`td[data-cell="${coordinate}"]`)
export const icon = (page: Page, coordinate: string) => cell(page, coordinate).locator('[data-conditional-icon]')
export const dialog = (page: Page) => page.getByRole('dialog', { name: 'Conditional formatting', exact: true })
export const input = (page: Page) => page.getByRole('textbox', { name: 'Active cell value', exact: true })

export async function go(page: Page, reference: string) {
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill(reference)
  await button(page, 'Go').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(input(page)).toBeEnabled()
}

export async function write(page: Page, address: string, value: string) {
  await go(page, address); await input(page).fill(value); await input(page).press('Enter')
}

/** Start in the real demo, then create a workbook using its public File action. */
export async function start(page: Page, width: number) {
  await page.setViewportSize({ width, height: 850 })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/?locale=en-US')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await button(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await button(page, 'New blank workbook').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Fixture setup is one real DOM paste; individual writes remain for CF recalculation tests.
  await select(page, 'A1', '0:0')
  await page.evaluate(() => navigator.clipboard.writeText('0\t20\t\n10\t\tNeighbor\n100\t\t'))
  await paste(page)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
  for (const [coordinate, value] of [
    ['0:0', '0'], ['0:1', '20'], ['0:2', ''],
    ['1:0', '10'], ['1:1', ''], ['1:2', 'Neighbor'],
    ['2:0', '100'], ['2:1', ''], ['2:2', ''],
  ]) await expect(cell(page, coordinate!)).toHaveText(value!)
  await go(page, 'A1:A3')
}

export async function open(page: Page, kind?: 'color-scale' | 'data-bar' | 'icon-set') {
  await button(page, 'Conditional formatting').click()
  await expect(dialog(page)).toBeVisible()
  if (kind) await page.getByLabel('Rule type', { exact: true }).selectOption(kind)
}

export async function save(page: Page, edit = false) {
  await button(page, edit ? 'Save rule' : 'Add rule').click()
  await expect(dialog(page)).toHaveCount(0)
}

export async function threshold(page: Page, position: string, type: string, value?: string) {
  await page.getByLabel(`${position} threshold type`, { exact: true }).selectOption(type)
  if (value !== undefined) await page.getByLabel(`${position} threshold value`, { exact: true }).fill(value)
}

export async function cleanNeighbor(page: Page) {
  await expect(cell(page, '1:2')).toHaveText('Neighbor')
  await expect(icon(page, '1:2')).toHaveCount(0)
  await expect(cell(page, '1:2').locator('[data-data-bar]')).toHaveCount(0)
}

export async function addIcons(page: Page) {
  await go(page, 'A1:A3'); await open(page, 'icon-set'); await save(page)
}
