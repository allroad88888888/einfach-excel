import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import {
  accountingButton as button, accountingCell as cell, accountingDialog as dialog,
  accountingFormula as formula, accountingPreview as preview, applyAccounting, expectAccounting,
  expectAccountingSettings, openAccounting, setAccountingInput as input, startAccounting,
} from '../support/accounting-number-format'

test.beforeEach(async ({ page }) => startAccounting(page))

test('accounting settings align symbols left, bracket negatives and show zero as a dash without changing formulas', async ({ page }) => {
  await input(page, 'E40', '39:4', '=-1234.5')
  await input(page, 'E41', '40:4', '1234.5')
  await input(page, 'E42', '41:4', '0')
  const neighbor = await cell(page, '42:4').innerText()
  await openAccounting(page, 'E40:E42', '39:4')
  await expectAccounting(preview(page), '$', '-')
  await expect(cell(page, '39:4')).toHaveText('-1234.5')
  await applyAccounting(page)
  await expectAccounting(cell(page, '39:4'), '$', '(1,234.50)')
  await expectAccounting(cell(page, '40:4'), '$', '1,234.50')
  await expectAccounting(cell(page, '41:4'), '$', '-')
  await select(page, 'E40', '39:4')
  await expect(formula(page)).toHaveValue('=-1234.5')
  const target = cell(page, '40:4')
  const box = (await target.boundingBox())!
  const start = (await target.locator('.cell-fill-start').boundingBox())!
  const end = (await target.locator('.cell-fill-end').boundingBox())!
  expect(start.x - box.x).toBeLessThanOrEqual(10)
  expect(box.x + box.width - end.x - end.width).toBeLessThanOrEqual(10)
  await expectAccountingSettings(page, '$', '2')
  await button(page, 'Undo').click()
  await expect(cell(page, '39:4')).toHaveText('-1234.5')
  await expect(cell(page, '40:4')).toHaveText('1234.5')
  await expect(cell(page, '41:4')).toHaveText('0')
  await button(page, 'Redo').click()
  await expectAccounting(cell(page, '39:4'), '$', '(1,234.50)')
  await expect(cell(page, '42:4')).toHaveText(neighbor)
})

for (const [action, digits, shown, title] of [
  ['Increase decimal places', '3', '(1,234.500)', 'Increase decimal places keeps the accounting symbol and undoes exactly once'],
  ['Decrease decimal places', '1', '(1,234.5)', 'Decrease decimal places keeps accounting parentheses and undoes exactly once'],
] as const) test(title, async ({ page }) => {
  await input(page, 'E40', '39:4', '=-1234.5')
  const neighbor = await cell(page, '40:4').innerText()
  await openAccounting(page, 'E40', '39:4', 'USD')
  await applyAccounting(page)
  await button(page, action).click()
  await expectAccounting(cell(page, '39:4'), 'USD', shown)
  await expect(formula(page)).toHaveValue('=-1234.5')
  await expectAccountingSettings(page, 'USD', digits)
  await button(page, 'Undo').click()
  await expectAccounting(cell(page, '39:4'), 'USD', '(1,234.50)')
  await button(page, 'Redo').click()
  await expectAccounting(cell(page, '39:4'), 'USD', shown)
  await expect(cell(page, '40:4')).toHaveText(neighbor)
})

test('accounting symbols remain literal at maximum precision and a blank symbol stays blank', async ({ page }) => {
  await input(page, 'E40', '39:4', '12.5')
  const symbol = '";\\*yyyy[Red]@00'
  await openAccounting(page, 'E40', '39:4', symbol, '15')
  await expectAccounting(preview(page), symbol, '12.500000000000000')
  await page.screenshot({ path: '../../.codex-artifacts/accounting-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(dialog(page)).toBeVisible()
  expect(await dialog(page).evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
  await page.screenshot({ path: '../../.codex-artifacts/accounting-mobile.png' })
  await applyAccounting(page)
  await expectAccounting(cell(page, '39:4'), symbol, '12.500000000000000')
  await openAccounting(page, 'E40', '39:4', '', '0')
  await applyAccounting(page)
  await expectAccounting(cell(page, '39:4'), '', '13')
  await expectAccountingSettings(page, '', '0')
})

test('accounting and custom demo examples are imported into Rust without changing existing values', async ({ page }) => {
  await select(page, 'O19', '18:14')
  await expect(cell(page, '18:14')).toHaveText('10.0%')
  await expect(cell(page, '18:14')).toHaveCSS('color', 'rgb(0, 0, 255)')
  await expect(formula(page)).toHaveValue('0.1')
  await select(page, 'P19', '18:15')
  await expectAccounting(cell(page, '18:15'), '$', '158.76')
  await expect(formula(page)).toHaveValue('158.76')
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'A19:C19', '18:0')
  await expectAccounting(cell(page, '18:0'), '$', '1,234.50')
  await expectAccounting(cell(page, '18:1'), '$', '(1,234.50)')
  await expectAccounting(cell(page, '18:2'), '$', '-')
  await select(page, 'A19', '18:0')
  await expect(formula(page)).toHaveValue('1234.5')
  await expectAccountingSettings(page, '$', '2')
})
