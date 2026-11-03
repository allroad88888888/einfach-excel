import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

async function setCell(page: Page, address: string, coord: string, input: string) {
  await select(page, address, coord)
  const editor = page.getByRole('textbox', { name: 'Active cell value' })
  await editor.fill(input)
  await editor.press('Enter')
}

async function evaluateF1(page: Page) {
  await select(page, 'F1', '0:5')
  await page.getByRole('button', { name: 'Evaluate Formula', exact: true }).click()
  return page.getByRole('dialog', { name: 'Evaluate Formula' })
}

async function watchF1(page: Page) {
  await select(page, 'F1', '0:5')
  await page.getByRole('button', { name: 'Watch Window', exact: true }).click()
  await page.getByRole('button', { name: 'Add Watch', exact: true }).click()
  return page.locator('[data-watch-row]').first()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/base-sales-orders/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')
  await setCell(page, 'D1', '0:3', '10')
  await setCell(page, 'E1', '0:4', '=D1*2')
  await setCell(page, 'F1', '0:5', '=E1+5')
  await setCell(page, 'G1', '0:6', '99')
  await expect(page.locator('td[data-cell="0:5"]')).toHaveText('25')
})

test.afterEach(async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Evaluate Formula' })
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('tab', { name: 'Sheet3', exact: true }).click()
  await expect(page.locator('td[data-cell="0:6"]')).toHaveText('99')
})

test('trace precedents draws the referenced cell arrow without changing values', async ({ page }) => {
  await select(page, 'E1', '0:4')
  await page.getByRole('button', { name: 'Trace Precedents', exact: true }).click()
  await expect(page.locator('[data-auditing-arrow]')).toHaveCount(1)
  await expect(page.locator('[data-auditing-arrow] line')).toHaveAttribute('x1', /^\d/)
  await expect(page.locator('td[data-cell="0:4"]')).toHaveText('20')
})

test('trace dependents draws the dependent cell arrow without changing values', async ({ page }) => {
  await select(page, 'E1', '0:4')
  await page.getByRole('button', { name: 'Trace Dependents', exact: true }).click()
  await expect(page.locator('[data-auditing-arrow]')).toHaveCount(1)
  await expect(page.locator('td[data-cell="0:5"]')).toHaveText('25')
})

test('remove arrows clears existing precedent and dependent traces', async ({ page }) => {
  await select(page, 'E1', '0:4')
  await page.getByRole('button', { name: 'Trace Precedents', exact: true }).click()
  await page.getByRole('button', { name: 'Trace Dependents', exact: true }).click()
  await expect(page.locator('[data-auditing-arrow]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Remove Arrows', exact: true }).click()
  await expect(page.locator('[data-auditing-overlay="true"]')).toHaveCount(0)
})

test('evaluate formula advances highlighted expressions to the final result', async ({ page }) => {
  const dialog = await evaluateF1(page)
  await expect(dialog.locator('[data-evaluate-focus="true"]')).toHaveText('E1')
  await dialog.getByRole('button', { name: 'Evaluate', exact: true }).click()
  await expect(dialog.locator('[data-evaluate-focus="true"]')).toContainText('20')
  await dialog.getByRole('button', { name: 'Evaluate', exact: true }).click()
  await expect(dialog.locator('[data-evaluate-final-result="true"]')).toContainText('25')
})

test('step in opens the referenced formula evaluation', async ({ page }) => {
  const dialog = await evaluateF1(page)
  await dialog.getByRole('button', { name: 'Step In', exact: true }).click()
  await expect(dialog.locator('[data-evaluate-reference="true"]')).toContainText('Sheet3!E1')
  await expect(dialog.locator('[data-evaluate-focus="true"]')).toHaveText('D1')
})

test('step out restores the parent formula evaluation', async ({ page }) => {
  const dialog = await evaluateF1(page)
  await dialog.getByRole('button', { name: 'Step In', exact: true }).click()
  await expect(dialog.locator('[data-evaluate-reference="true"]')).toContainText('Sheet3!E1')
  await dialog.getByRole('button', { name: 'Step Out', exact: true }).click()
  await expect(dialog.locator('[data-evaluate-reference="true"]')).toContainText('Sheet3!F1')
  await expect(dialog.locator('[data-evaluate-focus="true"]')).toContainText('20')
})

test('restart returns formula evaluation to its first step', async ({ page }) => {
  const dialog = await evaluateF1(page)
  await dialog.getByRole('button', { name: 'Evaluate', exact: true }).click()
  await expect(dialog.locator('[data-evaluate-focus="true"]')).toContainText('20')
  await dialog.getByRole('button', { name: 'Restart', exact: true }).click()
  await expect(dialog.locator('[data-evaluate-focus="true"]')).toHaveText('E1')
})

test('close dismisses formula evaluation without changing the formula', async ({ page }) => {
  const dialog = await evaluateF1(page)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('td[data-cell="0:5"]')).toHaveText('25')
})

test('Escape closes formula evaluation and restores its toolbar trigger', async ({ page }) => {
  const dialog = await evaluateF1(page)
  await expect(dialog.getByRole('button', { name: 'Evaluate', exact: true })).toBeFocused()
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: 'Restart', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Evaluate Formula', exact: true })).toBeFocused()
  await expect(page.locator('td[data-cell="0:5"]')).toHaveText('25')
})

test('add watch keeps the watched formula value current after upstream edits', async ({ page }) => {
  const row = await watchF1(page)
  await expect(row.locator('[data-watch-col="cell"]')).toHaveText('F1')
  await expect(row.locator('[data-watch-col="value"]')).toHaveText('25')
  await setCell(page, 'D1', '0:3', '20')
  await expect(row.locator('[data-watch-col="value"]')).toHaveText('45')
})

test('watch row click navigates back to its worksheet and cell', async ({ page }) => {
  const row = await watchF1(page)
  await expect(row.locator('[data-watch-col="value"]')).toHaveText('25')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await row.click()
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('F1')
})

test('keyboard activation of a watch row returns to its cell', async ({ page }) => {
  const row = await watchF1(page)
  await expect(row.locator('[data-watch-col="value"]')).toHaveText('25')
  await page.getByRole('tab', { name: 'Sales Orders', exact: true }).click()
  await row.focus()
  await row.press('Enter')
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('F1')
  await expect(page.locator('td[data-cell="0:5"]')).toHaveText('25')
})

test('delete watch removes the selected watch without changing its cell', async ({ page }) => {
  const row = await watchF1(page)
  await row.click()
  await page.getByRole('button', { name: 'Delete Watch', exact: true }).click()
  await expect(page.locator('[data-watch-row]')).toHaveCount(0)
  await expect(page.locator('td[data-cell="0:5"]')).toHaveText('25')
})

test('trace precedents includes sheets in a three dimensional formula', async ({ page }) => {
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet4' })).toHaveAttribute('aria-selected', 'true')
  await setCell(page, 'D1', '0:3', '5')
  await page.getByRole('tab', { name: 'Sheet3', exact: true }).click()
  await setCell(page, 'H1', '0:7', '=SUM(Sheet3:Sheet4!D1)')
  await expect(page.locator('td[data-cell="0:7"]')).toHaveText('15')
  await select(page, 'H1', '0:7')
  await page.getByRole('button', { name: 'Trace Precedents', exact: true }).click()
  await expect(page.locator('[data-auditing-arrow]')).toHaveCount(2)
})

test('trace precedents follows a sheet qualified named formula', async ({ page }) => {
  await page.getByRole('button', { name: 'Name manager', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Total')
  await page.getByLabel('Scope', { exact: true }).selectOption({ label: 'Sheet3' })
  await page.getByLabel('Refers to', { exact: true }).fill('=$D$1*2')
  await page.getByRole('button', { name: 'Create name', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Name manager' })).toHaveCount(0)
  await setCell(page, 'H1', '0:7', '=sheet3!Total')
  await expect(page.locator('td[data-cell="0:7"]')).toHaveText('20')
  await select(page, 'H1', '0:7')
  await page.getByRole('button', { name: 'Trace Precedents', exact: true }).click()
  await expect(page.locator('[data-auditing-arrow]')).toHaveCount(1)
})
