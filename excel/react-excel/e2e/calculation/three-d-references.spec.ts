import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
})

async function switchSheet(page: Page, name: string) {
  const tab = page.getByRole('tab', { name, exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.grid-projection-state')).toHaveCount(0)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
}

async function setCellFormulaOrValue(
  page: Page,
  address: string,
  cellKey: string,
  text: string,
) {
  await select(page, address, cellKey)
  const formulaBar = page.getByRole('textbox', { name: 'Active cell value' })
  await formulaBar.fill(text)
  await formulaBar.press('Enter')
}

test('evaluates 3D references across sheets and recalculates when spanned cells change', async ({
  page,
}) => {
  // Add Sheet3 and Sheet4 so workbook has: Sales Orders, Summary, Sheet3, Sheet4
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')
  await setCellFormulaOrValue(page, 'C5', '4:2', '30')

  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet4' })).toHaveAttribute('aria-selected', 'true')

  await switchSheet(page, 'Sales Orders')
  await setCellFormulaOrValue(page, 'C5', '4:2', '10')

  await switchSheet(page, 'Summary')
  await setCellFormulaOrValue(page, 'C5', '4:2', '20')

  await switchSheet(page, 'Sheet4')
  await setCellFormulaOrValue(page, 'A1', '0:0', "=SUM('Sales Orders:Sheet3'!C5)")
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('60')

  await setCellFormulaOrValue(page, 'A2', '1:0', "=AVERAGE('Sales Orders':'Sheet3'!C5)")
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('20')

  // Standalone 3D reference without aggregation evaluates to #VALUE!
  await setCellFormulaOrValue(page, 'A3', '2:0', "='Sales Orders:Sheet3'!C5")
  await expect(page.locator('td[data-cell="2:0"]')).toHaveText('#VALUE!')

  // Missing sheet endpoint evaluates to #REF!
  await setCellFormulaOrValue(page, 'A4', '3:0', '=SUM(Sheet3:NoSuchSheet!C5)')
  await expect(page.locator('td[data-cell="3:0"]')).toHaveText('#REF!')

  // Updating middle sheet (Summary!C5) recalculates Sheet4!A1 and Sheet4!A2
  await switchSheet(page, 'Summary')
  await setCellFormulaOrValue(page, 'C5', '4:2', '50')

  await switchSheet(page, 'Sheet4')
  await expect(page.locator('td[data-cell="0:0"]')).toHaveText('90')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('30')
})
