import { expect, test } from '@playwright/test'
import { downloadDateFile } from '../support/conditional-dates'
import { button, cell, go } from '../support/date-filter'
import { showRibbonItem } from '../support/ribbon'
import { applySubtotal, launchSubtotal, openSubtotal } from '../support/subtotal'

for (const [action, title] of [
  ['Remove all', 'Remove all retains data validation that belongs only to a generated row'],
  ['Apply subtotals', 'Replacing subtotals retains data validation that belongs only to a generated row'],
] as const) test(title, async ({ page }) => {
  await launchSubtotal(page)
  await openSubtotal(page)
  await applySubtotal(page)
  await go(page, 'H4')
  await showRibbonItem(page, 'data.data-validation')
  await button(page, 'Data validation').click()
  const validation = page.getByRole('dialog', { name: 'Data validation', exact: true })
  await validation.getByLabel('Allow', { exact: true }).selectOption('list')
  await validation.getByLabel('Items, one per line', { exact: true }).fill('Red\nGreen')
  await validation.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(validation).toHaveCount(0)
  const saved = JSON.parse((await downloadDateFile(page)).toString())
  expect(saved.workbook.dataValidations[0].regions[0].range).toEqual([3, 7, 3, 7])

  const panel = await openSubtotal(page, 'A1')
  await panel.getByRole('button', { name: action, exact: true }).click()
  await expect(panel.getByRole('alert')).toContainText('would delete a data validation rule')
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(cell(page, '3:0')).toHaveText('East Total')
  await expect(cell(page, '7:2')).toHaveText('25')
  const after = JSON.parse((await downloadDateFile(page)).toString())
  expect(after).toEqual(saved)
})
