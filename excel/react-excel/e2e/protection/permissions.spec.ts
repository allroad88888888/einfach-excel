import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { button, cell, closeProtection, openProtection, panel, protect } from './support'
import { showRibbonItem } from '../support/ribbon'

const sortMenu = (page: Page) => page.getByRole('combobox', { name: 'Sort selected range' })
const structureMenu = (page: Page) =>
  page.getByRole('combobox', { name: 'Insert or delete rows and columns' })

async function selectAddress(page: Page, address: string) {
  const box = page.getByRole('textbox', { name: 'Name box', exact: true })
  await box.fill(address)
  await box.press('Enter')
  await expect(box).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
}

async function enablePermission(page: Page, label: string) {
  const checkbox = panel(page).getByRole('checkbox', { name: label, exact: true })
  await checkbox.click()
  await expect(checkbox).toBeChecked()
}

async function openSummarySortRegion(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await selectAddress(page, 'A25:C29')
  await expect(cell(page, '24:0')).toHaveText('Team')
}

async function expectSummaryCodes(page: Page, expected: readonly string[]) {
  for (let index = 0; index < expected.length; index += 1) {
    await expect(cell(page, `${25 + index}:2`)).toHaveText(expected[index]!)
  }
}

test('PROTPERM-001: protected sheet allows sorting unlocked range when permitted and rejects locked cells', async ({
  page,
}) => {
  await openSummarySortRegion(page)
  await expectSummaryCodes(page, ['W20', 'E10', 'W10', 'E30'])

  await selectAddress(page, 'A26:C29')
  await openProtection(page)
  await button(page, 'Allow editing in selection A26:C29').click()
  await expect(button(page, 'Remove editable range A26:C29')).toBeVisible()
  await enablePermission(page, 'Sort editable ranges')
  await protect(page)
  await closeProtection(page)

  // Unlocked data rows sort cleanly and undo restores the original order
  await showRibbonItem(page, 'data.sort-selected-range')
  await sortMenu(page).selectOption('asc')
  await expect(page.getByLabel('Sort status')).toHaveText(/Sorted \d+ rows\./)
  await expectSummaryCodes(page, ['E10', 'E30', 'W20', 'W10'])

  await button(page, 'Undo').click()
  await expectSummaryCodes(page, ['W20', 'E10', 'W10', 'E30'])

  // Including locked header row A25 without header mode is rejected
  await selectAddress(page, 'A25:C29')
  await showRibbonItem(page, 'data.sort-selected-range')
  await sortMenu(page).selectOption('asc')
  await expect(page.getByLabel('Sort status')).toHaveAttribute('role', 'alert')
  await expectSummaryCodes(page, ['W20', 'E10', 'W10', 'E30'])
})

test('PROTPERM-002: protected sheet allows only granted row or column insertions and deletions with undo', async ({
  page,
}) => {
  await openSummarySortRegion(page)
  await openProtection(page)
  await enablePermission(page, 'Insert rows')
  await enablePermission(page, 'Delete rows')
  await protect(page)
  await closeProtection(page)

  // Row insert is permitted and shifts row 25 down to row 26
  await selectAddress(page, 'A25')
  await showRibbonItem(page, 'structure.insert-or-delete-rows-and-columns')
  await structureMenu(page).selectOption('insert-rows')
  await expect(cell(page, '24:0')).toHaveText('')
  await expect(cell(page, '25:0')).toHaveText('Team')

  // Undo restores row 25 while still protected
  await button(page, 'Undo').click()
  await expect(cell(page, '24:0')).toHaveText('Team')

  // Row delete is permitted and undo restores it
  await selectAddress(page, 'A25')
  await showRibbonItem(page, 'structure.insert-or-delete-rows-and-columns')
  await structureMenu(page).selectOption('delete-rows')
  await expect(cell(page, '24:0')).not.toHaveText('Team')
  await button(page, 'Undo').click()
  await expect(cell(page, '24:0')).toHaveText('Team')

  // Column insert was NOT granted and must be rejected
  await showRibbonItem(page, 'structure.insert-or-delete-rows-and-columns')
  await structureMenu(page).selectOption('insert-columns')
  await expect(page.getByRole('alert')).toContainText('Unprotect')
  await expect(cell(page, '24:0')).toHaveText('Team')
})

test('PROTPERM-003: native workbook download and reopen preserve worksheet protection permissions', async ({
  page,
}) => {
  await openSummarySortRegion(page)
  await selectAddress(page, 'A26:C29')
  await openProtection(page)
  await button(page, 'Allow editing in selection A26:C29').click()
  await expect(button(page, 'Remove editable range A26:C29')).toBeVisible()
  await enablePermission(page, 'Sort editable ranges')
  await enablePermission(page, 'Insert rows')
  await protect(page)
  await closeProtection(page)

  await button(page, 'File').click()
  const downloading = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const file = await downloading
  const text = await readFile((await file.path())!, 'utf8')
  const parsed = JSON.parse(text) as {
    workbook: {
      protection: Array<{
        sheet: number
        protection: { mode: string; permissions?: Record<string, boolean> }
      }>
    }
  }
  const summaryEntry = parsed.workbook.protection.find((item) => item.sheet === 1)
  expect(summaryEntry?.protection.mode).toBe('protected')
  expect(summaryEntry?.protection.permissions).toEqual({
    sort: true,
    insertRows: true,
    insertColumns: false,
    deleteRows: false,
    deleteColumns: false,
  })
  await button(page, 'Close').click()

  // Reload clean state and reopen the downloaded workbook
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await button(page, 'File').click()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'ProtectionPermissions.einfach.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await selectAddress(page, 'A26:C29')
  await openProtection(page)
  await expect(
    panel(page).getByRole('checkbox', { name: 'Sort editable ranges', exact: true }),
  ).toBeChecked()
  await expect(panel(page).getByRole('checkbox', { name: 'Insert rows', exact: true })).toBeChecked()
  await expect(
    panel(page).getByRole('checkbox', { name: 'Insert columns', exact: true }),
  ).not.toBeChecked()
  await closeProtection(page)

  // Granted sort permission still works after roundtrip
  await showRibbonItem(page, 'data.sort-selected-range')
  await sortMenu(page).selectOption('asc')
  await expect(page.getByLabel('Sort status')).toHaveText(/Sorted \d+ rows\./)
  await expectSummaryCodes(page, ['E10', 'E30', 'W20', 'W10'])
})
