import { expect, test, type Locator, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'

async function mount(page: Page) {
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto('/e2e/fixtures/plugin-hosts/?case=filter')
  await expect(page.locator('#first td[data-cell="1:1"]')).toHaveText('A1', { timeout: 15_000 })
  await expect(page.locator('#second td[data-cell="1:1"]')).toHaveText('B1', { timeout: 15_000 })
}

async function open(scope: Locator) {
  const name = scope.getByRole('textbox', { name: 'Name box' })
  await name.fill('A1:B4'); await name.press('Enter')
  await showRibbonItem(scope, 'data.worksheet-filter')
  await scope.getByRole('combobox', { name: 'Worksheet filter' }).selectOption('selection')
  await scope.getByRole('button', { name: 'Filter column A', exact: true }).click()
  await scope.getByRole('button', { name: 'Top / Bottom…', exact: true }).click()
}

test('rank drafts and native results are isolated between two spreadsheet instances', async ({ page }) => {
  await mount(page)
  const first = page.locator('#first'); const second = page.locator('#second')
  await open(first)
  await first.getByLabel('Rank amount 1', { exact: true }).fill('1')
  await first.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(first.locator('td[data-cell="1:1"]')).toHaveCount(0)
  await expect(first.locator('td[data-cell="2:1"]')).toHaveText('A3')
  await expect(second.locator('td[data-cell="1:1"]')).toHaveText('B1')
  await open(second)
  await expect(second.getByLabel('Rank amount 1', { exact: true })).toHaveValue('10')
  await second.getByRole('button', { name: 'Cancel', exact: true }).click()
  await first.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(first.locator('td[data-cell="1:1"]')).toHaveText('A1')
  await expect(second.locator('td[data-cell="3:1"]')).toHaveText('B2')
})

test('uninstalling the condition editor preserves the active typed draft through Apply', async ({ page }) => {
  await mount(page)
  const first = page.locator('#first')
  await open(first); await first.getByLabel('Rank amount 1', { exact: true }).fill('1')
  await page.keyboard.press('Alt+u')
  await expect(page.locator('#host-event')).toHaveText('uninstalled')
  await expect(first.getByLabel('Rank amount 1', { exact: true })).toHaveCount(0)
  await expect(first.getByText('This saved condition is preserved. Enable its plugin to edit it.')).toBeVisible()
  await first.getByRole('button', { name: 'Apply filter', exact: true }).click()
  await expect(first.getByRole('dialog')).toHaveCount(0)
  await expect(first.locator('td[data-cell="1:1"]')).toHaveCount(0)
  await expect(first.locator('td[data-cell="2:1"]')).toHaveText('A3')
  await expect(first.locator('td[data-cell="3:1"]')).toHaveCount(0)
  await first.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(first.locator('td[data-cell="1:1"]')).toHaveText('A1')
})
