import { expect, test, type Page } from '@playwright/test'

async function selectCell(page: Page, address: string, coord: string) {
  const name = page.getByRole('textbox', { name: 'Name box' })
  await name.fill(address)
  await name.press('Enter')
  const cell = page.locator(`td[data-cell="${coord}"]`)
  await expect(cell).toBeVisible()
  return cell
}

test('clear contents keeps formatting and Delete recalculates dependent formulas', async ({
  page,
}) => {
  await page.goto('/')
  const styled = await selectCell(page, 'P3', '2:15')
  await expect(styled).toHaveText('$125')
  await page.getByRole('button', { name: 'Clear contents', exact: true }).click()
  await expect(styled).toHaveText('')
  await expect(styled).toHaveCSS('font-weight', '700')
  await expect(page.getByRole('button', { name: 'Currency format' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const quantity = await selectCell(page, 'E2', '1:4')
  await page.locator('[data-workbook-grid]').press('Delete')
  await expect(quantity).toHaveText('')
  await expect(quantity).toHaveCSS('color', 'rgb(192, 0, 0)')
  const total = await selectCell(page, 'G2', '1:6')
  await expect(total).toHaveText('0')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E2*F2')
})

test('clear formatting preserves values and formulas', async ({ page }) => {
  await page.goto('/')
  const money = await selectCell(page, 'P3', '2:15')
  await page.getByRole('button', { name: 'Clear formatting', exact: true }).click()
  await expect(money).toHaveText('125.02')
  await expect(money).toHaveCSS('font-weight', '400')
  const total = await selectCell(page, 'G9', '8:6')
  await expect(total).toHaveText('2,632.00')
  await page.getByRole('button', { name: 'Clear formatting', exact: true }).click()
  await expect(total).toHaveText('2632')
  await expect(page.getByRole('textbox', { name: 'Active cell value' })).toHaveValue('=E9*F9')
})

test('clear formatting overrides inherited row styles only inside the target', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="2:0"]')).toBeVisible()
  await page.getByRole('button', { name: 'Select row 3', exact: true }).click()
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  const cell = await selectCell(page, 'B3', '2:1')
  await expect(cell).toHaveCSS('font-weight', '700')
  await page.getByRole('button', { name: 'Clear formatting', exact: true }).click()
  await expect(cell).toHaveCSS('font-weight', '400')
  await expect(page.locator('td[data-cell="2:0"]')).toHaveCSS('font-weight', '700')
  await page.getByRole('columnheader', { name: 'Select column B' }).click()
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await expect(cell).toHaveCSS('font-weight', '700')
})

test('clear all erases a selected row including offscreen cells without touching neighbours', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveCSS('font-weight', '700')
  await page.getByRole('button', { name: 'Select row 2', exact: true }).click()
  await page.getByRole('button', { name: 'Clear all', exact: true }).click()
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveCSS('font-weight', '400')
  await expect(page.locator('td[data-cell="2:0"]')).toHaveText('SO-10002')
  const farCell = await selectCell(page, 'P2', '1:15')
  await expect(farCell).toHaveText('')
  await expect(page.getByRole('button', { name: 'Currency format' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})
