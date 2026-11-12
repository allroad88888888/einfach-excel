import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'
import { showRibbonItem } from './ribbon'

export const dateButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
export const dateCell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

export async function openDateRules(page: Page) {
  await showRibbonItem(page, 'format.conditional-formatting')
  await dateButton(page, 'Conditional formatting').click()
  await expect(page.getByRole('dialog', { name: 'Conditional formatting', exact: true })).toBeVisible()
}

export async function addDateRule(page: Page, range: string, period = 'today', fill = '#00ff00') {
  await openDateRules(page)
  await page.getByLabel('Applies to', { exact: true }).fill(range)
  await page.getByLabel('Rule type').selectOption('time-period')
  await page.getByLabel('Date period').selectOption(period)
  await page.getByLabel('Highlight fill', { exact: true }).fill(fill)
  await dateButton(page, 'Add rule').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

export async function openDateFile(page: Page, bytes: Buffer, extension = 'einfach.json') {
  await dateButton(page, 'File').click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: `Dates.${extension}`, mimeType: extension === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/json', buffer: bytes,
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
}

export async function downloadDateFile(page: Page, excel = false) {
  await dateButton(page, 'File').click()
  const pending = page.waitForEvent('download')
  await dateButton(page, excel ? 'Download as Excel (.xlsx)' : 'Download workbook').click()
  const bytes = await readFile((await (await pending).path())!)
  await dateButton(page, 'Close').click()
  return bytes
}
