import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'basic.xlsx')
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const fileDialog = (page: Page) => page.getByRole('dialog', { name: 'Workbook files' })

async function openXlsx(page: Page, name: string, buffer: Buffer) {
  await page.getByRole('button', { name: 'File', exact: true }).click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({ name, mimeType: XLSX, buffer })
}

async function expectOrders(page: Page) {
  await expect(page.getByRole('tab', { name: 'Orders', exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Summary', exact: true })).toBeVisible()
  await expect(cell(page, '1:0')).toHaveText('Apple & Pear <x>')
  await expect(cell(page, '1:3')).toHaveText('3.75')
  await expect(cell(page, '4:0')).toHaveText('7.25')
  await expect(cell(page, '4:1')).toHaveText('Done!')
  await expect(cell(page, '1:5')).toHaveText('2026-10-30')
  await expect(cell(page, '0:0')).toHaveCSS('font-weight', '700')
  await expect(cell(page, '6:0')).toHaveText('Merged')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('opening an xlsx file replaces the workbook with its sheets, formulas and formatting', async ({ page }) => {
  await openXlsx(page, 'basic.xlsx', await readFile(fixture))
  await expectOrders(page)
  await expect(page.locator('.workbook-name')).toHaveText('basic')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('download as Excel writes an xlsx that opens back to the same workbook', async ({ page }) => {
  await openXlsx(page, 'basic.xlsx', await readFile(fixture))
  await expectOrders(page)
  await page.getByRole('button', { name: 'File', exact: true }).click()
  const download = page.waitForEvent('download')
  await fileDialog(page).getByRole('button', { name: 'Download as Excel (.xlsx)' }).click()
  const saved = await download
  expect(saved.suggestedFilename()).toBe('basic.xlsx')
  const bytes = await readFile((await saved.path())!)
  expect(bytes.subarray(0, 2).toString()).toBe('PK')
  await fileDialog(page).getByRole('button', { name: 'Close', exact: true }).click()

  await openXlsx(page, 'again.xlsx', bytes)
  await expectOrders(page)
})

test('an unreadable xlsx file is rejected and keeps the current workbook', async ({ page }) => {
  await openXlsx(page, 'broken.xlsx', Buffer.from('not really a zip'))
  await expect(fileDialog(page).getByRole('alert')).toContainText('not an .xlsx file')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('an xlsx file keeps hyperlinks, hidden rows and tables when opened', async ({ page }) => {
  await openXlsx(page, 'features.xlsx', await readFile(path.join(path.dirname(fixture), 'features.xlsx')))
  await expect(page.getByRole('tab', { name: 'Other Sheet', exact: true })).toBeVisible()
  await expect(cell(page, '9:0')).toContainText('Site')
  await expect(cell(page, '9:0').locator('[data-cell-hyperlink]')).toHaveAttribute('href', 'https://example.com/a?b=1&c=2')
  // 第 4 行（索引 3）被隐藏，其余可见。
  await expect(cell(page, '3:0')).toHaveCount(0)
  await expect(cell(page, '4:0')).toHaveText('item5')
  await expect(page.getByRole('status', { name: 'Workbook file status' })).toContainText(
    'Opened Excel workbook. Skipped: unsupported hyperlinks.',
  )
  await page.getByRole('button', { name: 'Name manager', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit Computed', exact: true }))
    .toContainText('Workbook · =SUM(Data!$B$2:$B$3)')
  await expect(page.getByRole('button', { name: 'Edit Quantities', exact: true }))
    .toContainText('Data!B2:B7')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await expect(cell(page, '4:0')).toHaveText('item5')
})

test('opening a 1904 xlsx file with unsupported parts converts dates and reports skipped features', async ({ page }) => {
  await openXlsx(page, 'edge_cases.xlsx', await readFile(path.join(path.dirname(fixture), 'edge_cases.xlsx')))
  await expect(page.getByRole('tab', { name: 'RichAndUnsupported', exact: true })).toBeVisible()
  await expect(cell(page, '1:0')).toHaveText('Bold plain')
  await expect(cell(page, '3:0')).toHaveText('Inline rich')
  await expect(cell(page, '1:2')).toHaveText('2013-01-01')
  const status = page.getByRole('status', { name: 'Workbook file status' })
  await expect(status).toContainText('Opened Excel workbook. Skipped:')
  await expect(status).toContainText('1904 date system')
  await expect(status).toContainText('charts')
  await expect(status).toContainText('macros')
})

test('downloading a workbook with non-exported features as Excel reports what was omitted', async ({ page }) => {
  await openXlsx(page, 'basic.xlsx', await readFile(fixture))
  await expectOrders(page)
  await page.getByRole('combobox', { name: 'Text rotation', exact: true }).selectOption({ label: '45°' })
  await page.getByRole('button', { name: 'File', exact: true }).click()
  const download = page.waitForEvent('download')
  await fileDialog(page).getByRole('button', { name: 'Download as Excel (.xlsx)' }).click()
  await download
  await expect(fileDialog(page).getByRole('status')).toContainText(
    'Download requested. Not exported to Excel: text rotation.',
  )
})
