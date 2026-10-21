import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { argumentsPanel, button, cell, commitArguments, field, neighbors, openArguments } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001'); await select(page, 'B3', '2:1')
})

test('FARG-009 adding an argument group keeps the fixed final expression', async ({ page }) => {
  await openArguments(page, 'LET')
  await field(page, 'name').fill('x'); await field(page, 'value').fill('2')
  await field(page, 'calculation').fill('x+y')
  await button(page, 'Add argument group').click()
  await expect(field(page, 'calculation')).toHaveValue('x+y')
  await field(page, 'name', 1).fill('y'); await field(page, 'value', 1).fill('5')
  await commitArguments(page, '=LET(x,2,y,5,x+y)', '7')
})

test('FARG-010 removing an argument group preserves the remaining parameters', async ({ page }) => {
  await openArguments(page, 'LET')
  await field(page, 'name').fill('discard'); await field(page, 'value').fill('99')
  await field(page, 'calculation').fill('kept*2')
  await button(page, 'Add argument group').click()
  await field(page, 'name', 1).fill('kept'); await field(page, 'value', 1).fill('6')
  await argumentsPanel(page).getByRole('button', { name: 'Remove group', exact: true }).first().click()
  await expect(field(page, 'name')).toHaveValue('kept')
  await expect(button(page, 'Remove group')).toBeDisabled()
  await commitArguments(page, '=LET(kept,6,kept*2)', '12')
})

test('FARG-011 Cancel button discards the argument form without a write', async ({ page }) => {
  await openArguments(page, 'IF'); await field(page, 'logical_test').fill('TRUE')
  await field(page, 'value_if_true').fill('7'); await button(page, 'Cancel').click()
  await expect(argumentsPanel(page)).toHaveCount(0)
  await expect(button(page, 'Insert function')).toBeFocused()
  await expect(cell(page)).toHaveText('Northwind'); await expect(button(page, 'Undo')).toBeDisabled()
  await neighbors(page)
})

test('FARG-012 Escape discards the argument form and restores its trigger', async ({ page }) => {
  await openArguments(page, 'LET'); await field(page, 'name').fill('x')
  await page.keyboard.press('Escape')
  await expect(argumentsPanel(page)).toHaveCount(0)
  await expect(button(page, 'Insert function')).toBeFocused()
  await expect(cell(page)).toHaveText('Northwind'); await expect(button(page, 'Undo')).toBeDisabled()
  await neighbors(page)
})
