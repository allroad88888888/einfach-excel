import { expect, test, type Page } from '@playwright/test'
import { closeProtection, openProtection, protect } from '../protection/support'
import { select } from '../support/clipboard'
import { showRibbonItem } from '../support/ribbon'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function openTextColumns(page: Page, source = 'B97', coord = '96:1') {
  await select(page, source, coord)
  await showRibbonItem(page, 'data.text-to-columns')
  await button(page, 'Text to columns').click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function chooseFile(page: Page, name: string, content: string, mimeType = 'text/plain') {
  const input = page.getByRole('dialog').locator('input[type="file"]')
  await input.setInputFiles({ name, mimeType, buffer: Buffer.from(content, 'utf8') })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('First order total')
})

test('TEXTFILE-001: importing a local CSV file preselects Comma, previews, writes atomically from active cell, and undoes in one step', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openTextColumns(page, 'B97', '96:1')
  // B97 is empty, so cell-source preview initially reports no text; importing a file replaces the source.
  await chooseFile(
    page,
    'regions.csv',
    '\uFEFF"North, West",0042,125.5\r\n"South, East",0099,=1+1\r\n',
    'text/csv',
  )
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Source file: regions.csv (2 rows)')
  await expect(dialog.getByRole('checkbox', { name: 'Comma', exact: true })).toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: 'Tab', exact: true })).not.toBeChecked()

  const preview = dialog.getByRole('table', { name: 'Split preview' })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('North, West')
  await expect(preview).toContainText('0042')
  // C98 (row 97, col 2) has 'Existing destination', so overwrite confirmation gates Apply split.
  await expect(button(page, 'Apply split')).toBeDisabled()
  await dialog.getByRole('checkbox', { name: /Overwrite 1 occupied/ }).check()
  await button(page, 'Apply split').click()
  await expect(dialog).toHaveCount(0)

  // Written atomically from B97:C98..D98; leading zeros preserved by default, '=1+1' stored as literal text, C98 keeps italic formatting.
  await expect(cell(page, '96:1')).toHaveText('North, West')
  await expect(cell(page, '96:2')).toHaveText('0042')
  await expect(cell(page, '96:3')).toHaveText('125.5')
  await expect(cell(page, '97:1')).toHaveText('South, East')
  await expect(cell(page, '97:2')).toHaveText('0099')
  await expect(cell(page, '97:2')).toHaveCSS('font-style', 'italic')
  await expect(cell(page, '97:3')).toHaveText('=1+1')
  // Neighbor E97 remains untouched.
  await expect(cell(page, '96:4')).toHaveText('"North, America",001,Ready')

  // Single-step Undo restores every cell in the rectangle, and Redo reapplies it.
  await button(page, 'Undo').click()
  await expect(cell(page, '96:1')).toHaveText('')
  await expect(cell(page, '97:2')).toHaveText('Existing destination')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '96:1')).toHaveText('North, West')
  await expect(cell(page, '97:2')).toHaveText('0099')
  expect(errors).toEqual([])
})

test('TEXTFILE-002: importing TSV and TXT files preselects Tab, supports fixed-width and column types, and switches back to selected cells', async ({
  page,
}) => {
  await openTextColumns(page, 'E97:E98', '96:4')
  const dialog = page.getByRole('dialog')
  await chooseFile(page, 'shipments.tsv', '007\t2026-03-15\tSKIP_ME\t250\r008\t2026-04-01\tDROP\t500')
  await expect(dialog).toContainText('Source file: shipments.tsv (2 rows)')
  await expect(dialog.getByRole('checkbox', { name: 'Tab', exact: true })).toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: 'Comma', exact: true })).not.toBeChecked()

  // Configure field 1 as Text, field 2 as Date (YMD), field 3 as Skip, field 4 as General, destination B99.
  const fieldType = dialog.getByRole('combobox', { name: /^Field type/ })
  await dialog.getByLabel('Destination cell', { exact: true }).fill('B99')
  await dialog.getByLabel('Source field number').fill('1')
  await fieldType.selectOption('text')
  await dialog.getByLabel('Source field number').fill('2')
  await fieldType.selectOption('dateYmd')
  await dialog.getByLabel('Source field number').fill('3')
  await fieldType.selectOption('skip')
  await dialog.getByLabel('Source field number').fill('4')
  await fieldType.selectOption('general')
  await button(page, 'Update preview').click()

  const preview = dialog.getByRole('table', { name: 'Split preview' })
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('2026-03-15')
  await expect(preview).not.toContainText('SKIP_ME')
  await button(page, 'Apply split').click()
  await expect(dialog).toHaveCount(0)

  await expect(cell(page, '98:1')).toHaveText('007')
  await expect(cell(page, '98:2')).toHaveText('46096')
  await expect(cell(page, '98:3')).toHaveText('250')
  await expect(cell(page, '99:3')).toHaveText('500')

  // Fixed-width TXT import + switching back to Use selected cells.
  await button(page, 'Undo').click()
  await expect(cell(page, '98:1')).toHaveText('')
  await openTextColumns(page, 'E99', '98:4')
  await chooseFile(page, 'codes.txt', 'AB0019\nCD0025')
  await dialog.getByLabel('Split mode').selectOption('fixedWidth')
  await dialog.getByLabel('Break positions').fill('2, 5')
  await dialog.getByLabel('Destination cell', { exact: true }).fill('B99')
  await button(page, 'Update preview').click()
  await expect(dialog.getByRole('table', { name: 'Split preview' })).toContainText('001')

  // Switch back to selected cells (E99 = '北京😀AB007') before applying.
  await button(page, 'Use selected cells').click()
  await expect(dialog).toContainText('Source: E99:E99')
  await button(page, 'Update preview').click()
  await expect(dialog.getByRole('table', { name: 'Split preview' })).toContainText('😀AB')
  await button(page, 'Apply split').click()
  await expect(cell(page, '98:1')).toHaveText('北京')
  await expect(cell(page, '98:2')).toHaveText('😀AB')
  await expect(cell(page, '98:3')).toHaveText('007')
})

test('TEXTFILE-003: empty file and protected or merged destination are rejected without mutating cells or history', async ({
  page,
}) => {
  await openTextColumns(page, 'B97', '96:1')
  const dialog = page.getByRole('dialog')

  // 1. Empty file is rejected immediately.
  await chooseFile(page, 'empty.csv', '', 'text/csv')
  await expect(dialog.getByRole('alert')).toContainText('empty')
  await expect(button(page, 'Apply split')).toBeDisabled()

  // 2. Valid file targeting merged range A15 is rejected without a misleading preview.
  await chooseFile(page, 'valid.csv', 'Alpha,Beta\nGamma,Delta', 'text/csv')
  await dialog.getByLabel('Destination cell', { exact: true }).fill('A15')
  await button(page, 'Update preview').click()
  await expect(dialog.getByRole('alert')).toContainText('Unmerge')
  await expect(dialog.getByRole('table', { name: 'Split preview' })).toHaveCount(0)
  await expect(button(page, 'Apply split')).toBeDisabled()

  // 3. Out-of-bounds destination H100 is rejected.
  await dialog.getByLabel('Destination cell', { exact: true }).fill('H100')
  await button(page, 'Update preview').click()
  await expect(dialog.getByRole('alert')).toContainText('boundary')
  await button(page, 'Cancel').click()
  await expect(button(page, 'Undo')).toBeDisabled()

  // 4. Protected worksheet rejects writing to locked cells.
  await openProtection(page)
  await protect(page)
  await closeProtection(page)
  await openTextColumns(page, 'B97', '96:1')
  await chooseFile(page, 'locked.csv', 'One,Two', 'text/csv')
  await expect(page.getByRole('table', { name: 'Split preview' })).toBeVisible()
  await button(page, 'Apply split').click()
  await expect(page.getByRole('alert')).toContainText('protected')
  await button(page, 'Cancel').click()
  await expect(cell(page, '96:1')).toHaveText('')
})
