import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { bar, button, cell, controlledJson, formula, openAsyncDemo, write } from './fixtures'

test.beforeEach(async ({ page }) => openAsyncDemo(page))

test('renaming the source sheet during HTTP I/O preserves identity and updates native cross-sheet sources', async ({ page }) => {
  const http = await controlledJson(page, 'renamed')
  await write(page, 'B12', '11:1', formula('renamed'))
  await page.getByRole('tab', { name: 'Async Summary', exact: true }).click()
  await write(page, 'B12', '11:1', "='Async JSON'!B12+1")
  await page.getByRole('tab', { name: 'Async JSON', exact: true }).click()
  await button(page, 'Rename sheet').click()
  await page.getByLabel('Sheet name').fill('Renamed JSON')
  await page.getByLabel('Sheet name').press('Enter')
  await page.getByRole('tab', { name: 'Async Summary', exact: true }).click()
  await select(page, 'B12', '11:1')
  await http.release(0, 7)
  await expect(cell(page, '11:1')).toHaveText('8')
  await expect(bar(page)).toHaveValue("=('Renamed JSON'!B12+1)")
})

test('deleting the pending source cannot inject its late HTTP result into a different sheet', async ({ page }) => {
  const http = await controlledJson(page, 'deleted')
  await write(page, 'B12', '11:1', formula('deleted'))
  await page.getByRole('tab', { name: 'Async Summary', exact: true }).click()
  await write(page, 'B12', '11:1', "='Async JSON'!B12+1")
  await page.getByRole('tab', { name: 'Async JSON', exact: true }).click()
  await button(page, 'Delete sheet').click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete worksheet', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Async JSON', exact: true })).toHaveCount(0)
  await http.release(0, 99)
  await select(page, 'B12', '11:1')
  await expect(cell(page, '11:1')).toHaveText('#REF!')
  await expect(page.getByRole('tab', { name: 'Async Summary', exact: true })).toHaveAttribute('aria-selected', 'true')
})
