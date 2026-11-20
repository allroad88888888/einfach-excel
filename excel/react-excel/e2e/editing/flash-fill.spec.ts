import { expect, test, type Page } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const fillMenu = (page: Page) => page.getByRole('combobox', { name: 'Fill selected range' })
const formulaInput = (page: Page) =>
  page.getByRole('textbox', { name: 'Active cell value', exact: true })

async function selectAddress(page: Page, address: string) {
  const box = page.getByRole('textbox', { name: 'Name box', exact: true })
  await box.fill(address)
  await box.press('Enter')
  await expect(box).toHaveValue(address)
  await expect(page.locator('[data-workbook-grid]')).toHaveAttribute(
    'data-projection-retained',
    'false',
  )
}

async function writeCell(page: Page, address: string, value: string) {
  await selectAddress(page, address)
  await formulaInput(page).fill(value)
  await formulaInput(page).press('Enter')
  await selectAddress(page, address)
  await expect(formulaInput(page)).toHaveValue(value)
}

async function openCleanSheet(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/e2e/fixtures/plain-sales-orders/')
  await expect(cell(page, '1:0')).toHaveText('SO-10001')
  await page.getByRole('button', { name: 'New sheet', exact: true }).click()
  await expect(cell(page, '0:0')).toHaveText('')
}

test('FLASHFILL-001: Flash Fill via ribbon splits and reformats names with single undo', async ({
  page,
}) => {
  await openCleanSheet(page)
  await writeCell(page, 'A1', 'Alice Smith')
  await writeCell(page, 'A2', 'Bob Jones')
  await writeCell(page, 'A3', 'Carol Lee')
  await writeCell(page, 'B1', 'Smith, Alice')

  await selectAddress(page, 'B2')
  await showRibbonItem(page, 'data.fill-selected-range')
  await fillMenu(page).selectOption('flash')

  await expect(page.getByLabel('Fill status')).toHaveText('Flash filled.')
  await expect(cell(page, '1:1')).toHaveText('Jones, Bob')
  await expect(cell(page, '2:1')).toHaveText('Lee, Carol')

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '0:1')).toHaveText('Smith, Alice')
  await expect(cell(page, '1:1')).toHaveText('')
  await expect(cell(page, '2:1')).toHaveText('')
})

test('FLASHFILL-002: Flash Fill via Ctrl+E combines columns into emails and skips headers', async ({
  page,
}) => {
  await openCleanSheet(page)
  await writeCell(page, 'A1', 'First')
  await writeCell(page, 'B1', 'Last')
  await writeCell(page, 'C1', 'Email')
  await writeCell(page, 'A2', 'Alice')
  await writeCell(page, 'B2', 'Smith')
  await writeCell(page, 'C2', 'alice.smith@acme.com')
  await writeCell(page, 'A3', 'Bob')
  await writeCell(page, 'B3', 'Jones')
  await writeCell(page, 'A4', 'Carol')
  await writeCell(page, 'B4', 'Chen')

  await selectAddress(page, 'C3')
  await page.locator('[data-workbook-grid]').focus()
  await page.keyboard.press('ControlOrMeta+e')

  await expect(cell(page, '0:2')).toHaveText('Email')
  await expect(cell(page, '2:2')).toHaveText('bob.jones@acme.com')
  await expect(cell(page, '3:2')).toHaveText('carol.chen@acme.com')

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cell(page, '2:2')).toHaveText('')
  await expect(cell(page, '3:2')).toHaveText('')
})

test('FLASHFILL-003: Flash Fill rejects multi-column selection and unresolvable patterns safely', async ({
  page,
}) => {
  await openCleanSheet(page)
  await writeCell(page, 'A1', 'Alice Smith')
  await writeCell(page, 'A2', 'Bob Jones')
  await writeCell(page, 'B1', 'XYZ')

  // Multi-column selection is rejected immediately
  await selectAddress(page, 'A1:B2')
  await showRibbonItem(page, 'data.fill-selected-range')
  await fillMenu(page).selectOption('flash')
  await expect(page.getByLabel('Fill status')).toHaveAttribute('role', 'alert')
  await expect(page.getByLabel('Fill status')).toContainText('single column')

  // Unresolvable pattern leaves destination untouched
  await selectAddress(page, 'B2')
  await fillMenu(page).selectOption('flash')
  await expect(page.getByLabel('Fill status')).toHaveAttribute('role', 'alert')
  await expect(cell(page, '1:1')).toHaveText('')
})
