import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { button, cell, menu, select, summary } from '../advanced-filter/support'

async function openTable(page: Page, name: string, address: string, key: string) {
  await select(page, address, key)
  await menu(page).selectOption('open')
  const dialog = page.getByRole('dialog', { name: `${name} filter conditions`, exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

test('Table grouped filters survive actual download and reopen independently of another Table', async ({ page }) => {
  await summary(page)
  await button(page, 'Cancel').click()
  const grouped = await openTable(page, 'DemoTable', 'A80', '79:0')
  await grouped.getByLabel('Filter column 1', { exact: true }).selectOption('0')
  await grouped.getByLabel('Filter condition 1', { exact: true }).selectOption('equals')
  await grouped.getByLabel('Filter value 1', { exact: true }).fill('Keyboard')
  await button(page, 'Add OR group').click()
  await grouped.getByLabel('Filter value 2', { exact: true }).fill('Mouse')
  await button(page, 'Apply filter').click()
  await expect(grouped).toHaveCount(0)
  await expect(cell(page, 82, 0)).toHaveCount(0)
  await expect(cell(page, 83, 1)).toHaveText('30')

  const other = await openTable(page, 'CalculatedOrders', 'A46', '45:0')
  await other.getByLabel('Minimum 1', { exact: true }).fill('2')
  await button(page, 'Apply filter').click()
  await expect(other).toHaveCount(0)
  await expect(cell(page, 46, 0)).toHaveCount(0)
  await expect(cell(page, 47, 0)).toHaveText('2')

  await button(page, 'File').click()
  const downloading = page.waitForEvent('download')
  await button(page, 'Download workbook').click()
  const downloaded = await downloading
  const text = await readFile((await downloaded.path())!, 'utf8')
  const file = JSON.parse(text)
  const tables = file.workbook.tables as {
    name: string
    autoFilter: { rules: { min?: number }[]; groups?: unknown[]; hiddenRows: number[] }
  }[]
  const storedGroups = tables.find((table) => table.name === 'DemoTable')!.autoFilter
  expect(storedGroups.rules).toEqual([])
  expect(storedGroups.groups).toHaveLength(2)
  expect(storedGroups.hiddenRows).toContain(82)
  expect(tables.find((table) => table.name === 'CalculatedOrders')!.autoFilter.rules[0].min).toBe(2)
  await button(page, 'Close').click()

  await select(page, 'A80', '79:0')
  await menu(page).selectOption('clear')
  await expect(cell(page, 82, 0)).toBeVisible()
  await select(page, 'A46', '45:0')
  await menu(page).selectOption('clear')
  await expect(cell(page, 46, 0)).toBeVisible()
  await button(page, 'File').click()
  page.once('dialog', (prompt) => prompt.accept())
  await page.getByLabel('Open workbook', { exact: true }).setInputFiles({
    name: 'TableGroups.einfach.json', mimeType: 'application/json', buffer: Buffer.from(text),
  })
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  const restored = await openTable(page, 'DemoTable', 'A80', '79:0')
  await expect(page.getByRole('group', { name: 'Filter group 2' })).toBeVisible()
  await expect(restored.getByLabel('Filter value 1', { exact: true })).toHaveValue('Keyboard')
  await expect(restored.getByLabel('Filter value 2', { exact: true })).toHaveValue('Mouse')
  await button(page, 'Cancel').click()
  await expect(cell(page, 80, 0)).toHaveText('Keyboard')
  await expect(cell(page, 81, 0)).toHaveText('Mouse')
  await expect(cell(page, 82, 0)).toHaveCount(0)
  await expect(cell(page, 83, 1)).toHaveText('30')
  const restoredOther = await openTable(page, 'CalculatedOrders', 'A46', '45:0')
  await expect(restoredOther.getByLabel('Minimum 1', { exact: true })).toHaveValue('2')
  await button(page, 'Cancel').click()
  await expect(cell(page, 46, 0)).toHaveCount(0)
  await expect(cell(page, 47, 0)).toHaveText('2')
  await expect(cell(page, 48, 0)).toHaveText('3')
  await expect(button(page, 'Undo')).toBeDisabled()
})
