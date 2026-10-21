import { expect, test } from '@playwright/test'
import { select } from '../support/clipboard'
import { button, cell, editor, register, choose, inputFormula, neighbors, download, openFile, openEditor,
  DOUBLE_ORDER_QUANTITY, expectOrderQuantitySource } from './fixtures'

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
})

test('undo custom definition replacement restores native result and catalog', async ({ page }) => {
  await register(page); await inputFormula(page); await choose(page)
  await page.getByLabel('Formula expression', { exact: true }).fill('=amount*3')
  await button(page, 'Replace formula').click(); await expect(cell(page, '2:10')).toHaveText('6')
  await button(page, 'Undo').click(); await expect(cell(page, '2:10')).toHaveText('4')
  await choose(page); await expect(page.getByLabel('Formula expression', { exact: true })).toHaveValue('=amount*2')
  await button(page, 'Cancel').click(); await neighbors(page)
})

test('redo custom definition removal restores native name error and removes catalog entry', async ({ page }) => {
  await register(page); await inputFormula(page); await choose(page); await button(page, 'Remove formula').click()
  await button(page, 'Undo').click(); await expect(cell(page, '2:10')).toHaveText('4')
  await button(page, 'Redo').click(); await expect(cell(page, '2:10')).toHaveText('#NAME?')
  await openEditor(page)
  await expect(page.getByLabel('Saved formula', { exact: true }).locator('option[value="DOUBLE"]')).toHaveCount(0)
  await button(page, 'Cancel').click(); await neighbors(page)
})

test('download workbook stores custom expression as data without rewriting formulas', async ({ page }) => {
  await register(page); await inputFormula(page)
  const file = await download(page)
  expect(file.workbook.customFormulas).toContainEqual({ name: 'DOUBLE', parameters: ['AMOUNT'], expression: '=amount*2' })
  await select(page, 'K3', '2:10')
  await expect(page.getByRole('textbox', { name: 'Active cell value', exact: true })).toHaveValue(DOUBLE_ORDER_QUANTITY)
  await neighbors(page)
})

test('open workbook restores custom definitions before formulas and updates completion', async ({ page }) => {
  await register(page); await inputFormula(page)
  const file = await download(page)
  await choose(page); await button(page, 'Remove formula').click()
  await openFile(page, file)
  await expect(page.getByRole('dialog', { name: 'Workbook files' })).toHaveCount(0)
  await select(page, 'K3', '2:10'); await expect(cell(page, '2:10')).toHaveText('4')
  await choose(page); await expect(page.getByLabel('Formula expression', { exact: true })).toHaveValue('=amount*2')
  await button(page, 'Cancel').click(); await neighbors(page)
})

test('custom completion accepts native definition and shows exact parameter help', async ({ page }) => {
  await register(page); await expectOrderQuantitySource(page); await select(page, 'K3', '2:10')
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await input.fill('=DOUB')
  await page.getByRole('option', { name: /^DOUBLE / }).click()
  await expect(input).toHaveValue('=DOUBLE(')
  await expect(page.getByRole('status', { name: 'Formula arguments' })).toContainText('AMOUNT')
  await input.fill(DOUBLE_ORDER_QUANTITY); await input.press('Enter')
  await expect(cell(page, '2:10')).toHaveText('4'); await neighbors(page)
})

test('invalid custom expression stays retryable and missing arguments produce native error', async ({ page }) => {
  await openEditor(page)
  await page.getByLabel('Function name', { exact: true }).fill('DOUBLE')
  await page.getByLabel('Parameters, separated by commas', { exact: true }).fill('amount, AMOUNT')
  await page.getByLabel('Formula expression', { exact: true }).fill('=amount*2')
  await button(page, 'Register formula').click()
  await expect(page.getByRole('alert')).toContainText('unique')
  await page.getByLabel('Parameters, separated by commas', { exact: true }).fill('amount')
  await button(page, 'Register formula').click()
  await expect(editor(page)).toHaveCount(0)
  await select(page, 'K3', '2:10'); await expect(cell(page, '2:10')).toHaveText('2026-09-04')
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await input.fill('=DOUBLE()'); await input.press('Enter')
  await expect(cell(page, '2:10')).toHaveText('#VALUE!'); await neighbors(page)
})

test('protected worksheet rejects custom definition mutation without changing native callers', async ({ page }) => {
  await register(page); await inputFormula(page)
  await button(page, 'Worksheet protection').click()
  await button(page, 'Protect worksheet').click()
  await expect(button(page, 'Unprotect worksheet')).toBeEnabled()
  await button(page, 'Close').click()
  await choose(page)
  await page.getByLabel('Formula expression', { exact: true }).fill('=amount*3')
  await button(page, 'Replace formula').click()
  await expect(page.getByRole('alert')).toContainText('protected')
  await button(page, 'Cancel').click(); await expect(cell(page, '2:10')).toHaveText('4')
  await neighbors(page)
})

test('custom expression replacement recalculates consumers in another worksheet', async ({ page }) => {
  await register(page)
  await page.getByRole('tab', { name: 'Summary', exact: true }).click()
  await select(page, 'H11', '10:7'); await expect(cell(page, '10:7')).toHaveText('')
  const input = page.getByRole('textbox', { name: 'Active cell value', exact: true })
  await input.fill('=DOUBLE(5)'); await input.press('Enter')
  await expect(cell(page, '10:7')).toHaveText('10')
  await choose(page); await page.getByLabel('Formula expression', { exact: true }).fill('=amount*3')
  await button(page, 'Replace formula').click()
  await expect(cell(page, '10:7')).toHaveText('15')
  await select(page, 'B11', '10:1'); await expect(cell(page, '10:1')).toHaveText('20')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click(); await neighbors(page)
})

test('invalid custom formula file is rejected atomically and never executes source', async ({ page }) => {
  await register(page); await inputFormula(page)
  const file = await download(page)
  file.workbook.customFormulas.push({ name: 'UNSAFE', parameters: [], expression: '=INDIRECT("A1")', source: 'alert(1)' })
  await openFile(page, file)
  await expect(page.getByRole('dialog', { name: 'Workbook files' }).getByRole('alert')).toContainText('Current workbook kept')
  await button(page, 'Close').click(); await select(page, 'K3', '2:10')
  await expect(cell(page, '2:10')).toHaveText('4'); await neighbors(page)
})
