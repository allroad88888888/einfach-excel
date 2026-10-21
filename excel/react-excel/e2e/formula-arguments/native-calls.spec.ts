import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { argumentsPanel, bar, button, cell, commitArguments, field, openArguments } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await select(page, 'B3', '2:1')
})

test('FARG-001 SUM arguments create one native formula edit', async ({ page }) => {
  await openArguments(page, 'SUM')
  await expect(field(page, 'number')).toBeFocused()
  await field(page, 'number').fill('SUM(1,2)')
  await button(page, 'Add argument group').click()
  await field(page, 'number', 1).fill('{3,4}')
  await button(page, 'Add argument group').click()
  await field(page, 'number', 2).fill('Summary!B1')
  await commitArguments(page, '=SUM(SUM(1,2),{3,4},Summary!B1)', '89')
})

test('FARG-002 IF omits an unused optional argument', async ({ page }) => {
  await openArguments(page, 'IF')
  await field(page, 'logical_test').fill('TRUE')
  await field(page, 'value_if_true').fill('"yes, ""quoted"""')
  await commitArguments(page, '=IF(TRUE,"yes, ""quoted""")', 'yes, "quoted"')
})

test('FARG-003 XLOOKUP preserves an optional middle argument hole', async ({ page }) => {
  await openArguments(page, 'XLOOKUP')
  await field(page, 'lookup_value').fill('2')
  await field(page, 'lookup_array').fill('Summary!A47:A49')
  await field(page, 'return_array').fill('Summary!B47:B49')
  await field(page, 'match_mode').fill('0')
  await commitArguments(page, '=XLOOKUP(2,Summary!A47:A49,Summary!B47:B49,,0)', '20')
})

test('FARG-004 LET edits repeated bindings before its fixed calculation', async ({ page }) => {
  await openArguments(page, 'LET')
  await field(page, 'name').fill('x'); await field(page, 'value').fill('SUM(1,2)')
  await field(page, 'calculation').fill('x+y')
  await button(page, 'Add argument group').click()
  await field(page, 'name', 1).fill('discard'); await field(page, 'value', 1).fill('99')
  await button(page, 'Add argument group').click()
  await field(page, 'name', 2).fill('y'); await field(page, 'value', 2).fill('4')
  await argumentsPanel(page).getByRole('button', { name: 'Remove group', exact: true }).nth(1).click()
  await expect(field(page, 'name', 1)).toHaveValue('y')
  await expect(field(page, 'calculation')).toHaveValue('x+y')
  await commitArguments(page, '=LET(x,SUM(1,2),y,4,x+y)', '7')
})

test('FARG-005 TODAY creates a zero-argument native call', async ({ page }) => {
  const serial = await page.evaluate(() => {
    const now = new Date()
    const midnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    return (midnight - Date.UTC(1899, 11, 30)) / 86_400_000
  })
  await openArguments(page, 'TODAY')
  await expect(argumentsPanel(page).getByRole('textbox')).toHaveCount(0)
  await expect(button(page, 'Create formula draft')).toBeFocused()
  await commitArguments(page, '=TODAY()', String(serial))
})

test('FARG-006 ORDER_NET uses native custom expression parameters', async ({ page }) => {
  await openArguments(page, 'ORDER_NET')
  await field(page, 'QUANTITY').fill('E3')
  await field(page, 'PRICE').fill('F3')
  await commitArguments(page, '=ORDER_NET(E3,F3)', '658')
  await expect(bar(page)).toHaveValue('=ORDER_NET(E3,F3)')
})
