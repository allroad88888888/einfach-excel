import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'

export const tabs = (page: Page) =>
  page.getByRole('tablist', { name: 'Workbook sheets' }).getByRole('tab')
export const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
export const cell = (page: Page, key: string) => page.locator(`td[data-cell="${key}"]`)
export const menu = (page: Page) => page.getByRole('menu', { name: 'Worksheet tab' })
export const menuItem = (page: Page, name: string) =>
  menu(page).getByRole('menuitem', { name, exact: true })

export async function openSeed(page: Page) {
  await page.goto('/e2e/fixtures/base-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
}

export async function openTabMenu(page: Page, name: string) {
  await tab(page, name).click({ button: 'right' })
  await expect(menu(page)).toBeVisible()
}

export async function chooseTabMenu(page: Page, sheet: string, item: string) {
  await openTabMenu(page, sheet)
  await menuItem(page, item).click()
}

export const undo = (page: Page) => page.getByRole('button', { name: 'Undo', exact: true }).click()
export const redo = (page: Page) => page.getByRole('button', { name: 'Redo', exact: true }).click()

export async function downloadWorkbook(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download workbook', exact: true }).click()
  const file = await downloading
  const text = await readFile((await file.path())!, 'utf8')
  await page.getByRole('dialog', { name: 'Workbook files' }).getByRole('button', { name: 'Close' }).click()
  return text
}

export async function openWorkbookText(page: Page, text: string) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'Book.einfach.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
}
