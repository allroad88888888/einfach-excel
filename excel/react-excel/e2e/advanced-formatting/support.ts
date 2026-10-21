import { expect, type Page } from '@playwright/test'
import { paste, select } from '../support/clipboard'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, coordinate: string) => page.locator(`td[data-cell="${coordinate}"]`)
export const dialog = (page: Page) => page.getByRole('dialog', { name: 'Conditional formatting', exact: true })
export const valueInput = (page: Page) => page.getByRole('textbox', { name: 'Active cell value', exact: true })

export async function go(page: Page, reference: string) {
  await button(page, 'Go to').click()
  await page.getByLabel('Reference', { exact: true }).fill(reference)
  await button(page, 'Go').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(valueInput(page)).toBeEnabled()
}

/** All data setup uses the public new-workbook and paste path. */
export async function start(page: Page, width: number, values: readonly string[]) {
  await page.setViewportSize({ width, height: 850 })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/?locale=en-US')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await button(page, 'File').click()
  page.once('dialog', prompt => prompt.accept())
  await button(page, 'New blank workbook').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await select(page, 'A1', '0:0')
  const tsv = values.map((value, index) => `${value}\t${index === 0 ? 'Neighbor' : ''}`).join('\n')
  await page.evaluate(text => navigator.clipboard.writeText(text), tsv)
  await paste(page)
  await expect(cell(page, '0:1')).toHaveText('Neighbor')
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute('data-projection-retained', 'false')
  await go(page, `A1:A${values.length}`)
}

export async function open(page: Page, kind?: 'text' | 'duplicate-values') {
  await button(page, 'Conditional formatting').click()
  await expect(dialog(page)).toBeVisible()
  if (kind) await page.getByLabel('Rule type', { exact: true }).selectOption(kind)
}
export async function save(page: Page, edit = false) {
  await button(page, edit ? 'Save rule' : 'Add rule').click()
  await expect(dialog(page)).toHaveCount(0)
}
export async function highlighted(page: Page, row: number, enabled = true) {
  if (enabled) await expect(cell(page, `${row}:0`)).toHaveCSS('background-color', 'rgb(255, 199, 206)')
  else await expect(cell(page, `${row}:0`)).not.toHaveCSS('background-color', 'rgb(255, 199, 206)')
}
export async function cleanNeighbor(page: Page) {
  await expect(cell(page, '0:1')).toHaveText('Neighbor')
  await expect(cell(page, '0:1')).not.toHaveCSS('background-color', 'rgb(255, 199, 206)')
}
export async function compareDisplay(page: Page, mode: 'duplicate' | 'unique' = 'duplicate') {
  await open(page, 'duplicate-values')
  await page.getByLabel('Highlight values', { exact: true }).selectOption(mode)
  await page.getByLabel('Compare by', { exact: true }).selectOption('display-text')
  await save(page)
}
export async function numberFormat(page: Page, reference: string, category: 'number' | 'percent' | 'date', digits = '0') {
  await go(page, reference); await button(page, 'Number format settings').click()
  await page.getByLabel('Number format category', { exact: true }).selectOption(category)
  if (category === 'date') await page.getByLabel('Date style', { exact: true }).selectOption('yyyy-mm-dd')
  else await page.getByLabel('Decimal places', { exact: true }).fill(digits)
  await button(page, 'Apply number format').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
