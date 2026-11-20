import { expect, test, type Page } from '@playwright/test'
import { button, cell, go } from '../support/date-filter'
import { checkRecords, launchCriteria, openCriteria } from '../support/worksheet-criteria'

const allRows = [1, 2, 3, 4, 5, 6, 7]

async function copySettings(page: Page, destination = "'Copied rows'!D1") {
  const dialog = await openCriteria(page)
  await dialog.getByRole('radio', { name: 'Copy to another location' }).check()
  await dialog.getByLabel('Copy to', { exact: true }).fill(destination)
  await dialog.getByLabel('Output headings, one per line', { exact: true }).fill('Day\nName')
  await dialog.getByRole('checkbox', { name: 'Unique records only' }).check()
  await dialog.getByRole('button', { name: 'Preview results' }).click()
  return dialog
}

test('Copy filtered records previews selected headings and requires overwrite confirmation', async ({ page }) => {
  await launchCriteria(page)
  const dialog = await copySettings(page)
  await expect(dialog.getByRole('table')).toBeVisible()
  await expect(dialog.getByRole('columnheader')).toHaveText(['Day', 'Name'])
  await expect(dialog.getByRole('cell', { name: '2024-02-29', exact: true })).toBeVisible()
  await expect(dialog.getByRole('status')).toHaveText('3 matching records')
  const copy = dialog.getByRole('button', { name: 'Copy results' })
  await expect(copy).toBeDisabled()
  await dialog.getByRole('checkbox', { name: 'Overwrite 1 occupied cell' }).check()
  await copy.click()
  await expect(dialog).toHaveCount(0)
  await checkRecords(page, allRows)
  await page.getByRole('tab', { name: 'Copied rows', exact: true }).click()
  await go(page, 'D1')
  await expect(cell(page, '0:3')).toHaveText('Day')
  await expect(cell(page, '0:4')).toHaveText('Name')
  await expect(cell(page, '1:3')).toHaveText('2024-02-29')
  for (const [index, name] of ['Alpha', 'Beta', 'Qx*'].entries()) {
    await expect(cell(page, `${index + 1}:4`)).toHaveText(name)
  }
  await expect(cell(page, '6:3')).toHaveText('Outside output')
  await button(page, 'Undo').click()
  await expect(cell(page, '1:3')).toHaveText('Occupied')
  await expect(cell(page, '1:4')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
  await button(page, 'Redo').click()
  await expect(cell(page, '3:4')).toHaveText('Qx*')
})

test('Canceling a copy preview keeps the destination and history intact', async ({ page }) => {
  await launchCriteria(page)
  const dialog = await copySettings(page)
  await expect(dialog.getByRole('checkbox', { name: 'Overwrite 1 occupied cell' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('tab', { name: 'Copied rows', exact: true }).click()
  await go(page, 'D1')
  await expect(cell(page, '1:3')).toHaveText('Occupied')
  await expect(cell(page, '1:4')).toHaveText('')
  await expect(button(page, 'Undo')).toBeDisabled()
})

test('Copy filtered records rejects a destination overlapping the source', async ({ page }) => {
  await launchCriteria(page)
  const dialog = await copySettings(page, 'B1')
  await expect(dialog.getByRole('alert')).toHaveText('Choose an output outside the source and criteria ranges.')
  await expect(dialog.getByRole('table')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await checkRecords(page, allRows)
  await expect(button(page, 'Undo')).toBeDisabled()
})
