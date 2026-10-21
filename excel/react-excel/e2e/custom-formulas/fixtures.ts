import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
export const editor = (page: Page) => page.getByRole('dialog', { name: 'Custom formulas', exact: true })
export const DOUBLE_ORDER_QUANTITY = '=DOUBLE(E3)'

/** The unchanged plain fixture has quantity 2 at E3; DOUBLE must return 4. */
export async function expectOrderQuantitySource(page: Page) {
  await select(page, 'E3', '2:4')
  await expect(cell(page, '2:4')).toHaveText('2')
}

export async function openEditor(page: Page) {
  await button(page, 'Custom formulas').click()
  await expect(editor(page)).toBeVisible()
  await expect(page.getByLabel('Function name', { exact: true })).toBeEnabled()
}
export async function register(page: Page, name = 'DOUBLE', parameters = 'amount', expression = '=amount*2') {
  await openEditor(page)
  await page.getByLabel('Function name', { exact: true }).fill(name)
  await page.getByLabel('Parameters, separated by commas', { exact: true }).fill(parameters)
  await page.getByLabel('Formula expression', { exact: true }).fill(expression)
  await button(page, 'Register formula').click()
  await expect(editor(page)).toHaveCount(0)
}
export async function choose(page: Page, name = 'DOUBLE') {
  await openEditor(page)
  await page.getByLabel('Saved formula', { exact: true }).selectOption(name)
}
export async function inputFormula(page: Page, value = DOUBLE_ORDER_QUANTITY, address = 'K3', coord = '2:10') {
  if (value === DOUBLE_ORDER_QUANTITY) await expectOrderQuantitySource(page)
  await select(page, address, coord)
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await input.fill(value); await input.press('Enter')
}
export async function neighbors(page: Page) {
  // Narrow grids virtualize columns; visit each unchanged cell through the UI.
  await select(page, 'A2', '1:0')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'A3', '2:0')
  await expect(cell(page, '2:0')).toHaveText('SO-10002')
  await select(page, 'G2', '1:6')
  await expect(cell(page, '1:6')).toHaveText('79')
}
export async function download(page: Page) {
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const result = await pending
  const value = JSON.parse(await readFile((await result.path())!, 'utf8'))
  await button(page, 'Close').click()
  return value
}
export async function openFile(page: Page, file: unknown) {
  await button(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({ name: 'Custom.einfach.json',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
}
