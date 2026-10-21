import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

export const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const cell = (page: Page, coord = '2:1') => page.locator(`td[data-cell="${coord}"]`)
export const bar = (page: Page) => page.getByRole('textbox', { name: 'Active cell value', exact: true })
export const argumentsPanel = (page: Page) => page.locator('dialog.formula-arguments-panel')
export const field = (page: Page, name: string, group = 0) => argumentsPanel(page)
  .locator(`[data-argument-name="${name}"] input`).nth(group)

export async function openArguments(page: Page, name: string) {
  await button(page, 'Insert function').click()
  const picker = page.getByRole('dialog', { name: 'Insert function', exact: true })
  await picker.getByRole('listbox', { name: 'Function', exact: true }).selectOption(name)
  await button(page, 'Fill arguments').click()
  await expect(argumentsPanel(page)).toBeVisible()
  await expect(argumentsPanel(page).locator('h2')).toContainText(name)
}

export async function neighbors(page: Page) {
  await expect(cell(page, '2:0')).toHaveText('SO-10002')
  await expect(cell(page, '2:2')).toHaveText('East')
}

/** The real Enter chain must produce one history entry, not one per form-field edit. */
export async function commitArguments(page: Page, formula: string, result: string) {
  await button(page, 'Create formula draft').click()
  await expect(argumentsPanel(page)).toHaveCount(0)
  await expect(bar(page)).toHaveValue(formula)
  await expect(bar(page)).toBeFocused()
  await expect(cell(page)).toHaveText('Northwind')
  await expect(button(page, 'Undo')).toBeDisabled()
  await page.keyboard.press('Enter')
  await expect(cell(page)).toHaveText(result)
  await neighbors(page)
  await button(page, 'Undo').click()
  await expect(cell(page)).toHaveText('Northwind')
  await expect(button(page, 'Undo')).toBeDisabled()
  await neighbors(page)
  await button(page, 'Redo').click()
  await expect(cell(page)).toHaveText(result)
  await select(page, 'B3', '2:1')
  await expect(bar(page)).toHaveValue(formula)
}

export async function download(page: Page) {
  await button(page, 'File').click()
  const pending = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const exported = await pending
  const file = JSON.parse(await readFile((await exported.path())!, 'utf8'))
  await button(page, 'Close').click()
  return file
}

export async function openFile(page: Page, file: unknown) {
  await button(page, 'File').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Arguments.einfach.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)),
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files', exact: true })).toHaveCount(0)
}
