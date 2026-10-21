import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, marker, timeline, openComments, closeComments } from './fixtures'

test('native comment example on Summary reads without adding history or altering the Orders demo', async ({ page }) => {
  await page.goto('/?locale=en-US')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'H84', '83:7')
  await expect(marker(page, '83:7')).toHaveCount(1)
  await expect(cell(page, '83:7')).toHaveText('')
  await openComments(page)
  await expect(timeline(page)).toContainText('Workbook example')
  await expect(timeline(page)).toContainText('Review this workbook cell.')
  await closeComments(page); await expect(button(page, 'Undo')).toBeDisabled()
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await expect(page.locator('[data-merged-cell="true"]')).not.toHaveCount(0)
})
