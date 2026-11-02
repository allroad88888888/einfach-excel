import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

async function setCell(page: Page, address: string, coord: string, text: string) {
  await select(page, address, coord)
  const editor = page.getByRole('textbox', { name: 'Active cell value' })
  await editor.fill(text)
  await editor.press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('td[data-cell="1:0"]')).toHaveText('SO-10001')
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet3' })).toHaveAttribute('aria-selected', 'true')
  await setCell(page, 'G1', '0:6', '99')
  await page.getByTestId('iterative-calculation-toggle').click()
  await expect(page.getByTestId('iterative-calculation-toggle')).toHaveAttribute('aria-pressed', 'true')
})

test('iterative calculation converges a cycle through a three dimensional reference', async ({ page }) => {
  await page.getByRole('button', { name: 'New sheet' }).click()
  await expect(page.getByRole('tab', { name: 'Sheet4' })).toHaveAttribute('aria-selected', 'true')
  await setCell(page, 'D1', '0:3', '2')
  await page.getByRole('tab', { name: 'Sheet3', exact: true }).click()
  await setCell(page, 'D1', '0:3', '=ROUND(SUM(Sheet3:Sheet4!D1)*0.5,2)')
  await expect(page.locator('td[data-cell="0:3"]')).toHaveText('2')
  await expect(page.locator('td[data-cell="0:6"]')).toHaveText('99')
})

test('iterative calculation converges a cycle through a scoped named formula', async ({ page }) => {
  await page.getByRole('button', { name: 'Name manager', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('Loop')
  await page.getByLabel('Scope', { exact: true }).selectOption({ label: 'Sheet3' })
  await page.getByLabel('Refers to', { exact: true }).fill('=ROUND($D$1*0.5+1,2)')
  await page.getByRole('button', { name: 'Create name', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Name manager' })).toHaveCount(0)
  await setCell(page, 'D1', '0:3', '=sheet3!Loop')
  await expect(page.locator('td[data-cell="0:3"]')).toHaveText('2')
  await expect(page.locator('td[data-cell="0:6"]')).toHaveText('99')
})
