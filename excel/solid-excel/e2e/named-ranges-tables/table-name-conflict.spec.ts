import { expect, test, type Page } from '@playwright/test'
import { cell, guardConsoleErrors, typeIntoCell, withEnglishLocale } from '../helpers'

/**
 * Table rename → name-conflict rejection on the Wave 5 static demo.
 *
 * The full Table name mutex (static-backend.ts::validateTableName) rejects
 * a rename whose UPPERCASED key collides with another table (or a defined
 * name) with the structured code `name-conflict`. The Name Manager maps it
 * to "That name is already in use." and must keep both the row and the
 * inline draft so the user can correct it — complementing the existing
 * `name-like-cell-ref` rejection in name-manager-table-actions.spec.ts.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

function dialog(page: Page) {
  return page.getByTestId('wave5-name-manager')
}

function tableRow(page: Page, name: string) {
  return dialog(page).locator(`[data-table-name="${name}"]`)
}

async function createTableOver(page: Page, fromAddr: string, toAddr: string, expected: string) {
  await cell(page, fromAddr).click()
  await cell(page, toAddr).click({ modifiers: ['Shift'] })
  await page.getByTestId('menu-bar-button-data').click()
  await page.getByTestId('menu-bar-item-data.createTable').click()
  await expect(page.getByTestId('menu-bar-create-table-status')).toHaveAttribute(
    'data-table-name',
    expected,
  )
}

test.describe('Name Manager — table rename name-conflict', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('renaming Table2 to Table1 (any case) is rejected and keeps row + draft', async ({
    page,
  }) => {
    await gotoWave5(page)

    // Table1 over the seeded Region block (header + 3 data rows).
    await createTableOver(page, 'A1', 'F4', 'Table1')

    // Seed a second block in the empty H/I columns, then Table2 over it.
    await typeIntoCell(page, 'H1', 'K')
    await typeIntoCell(page, 'I1', 'V')
    await typeIntoCell(page, 'H2', 'a')
    await typeIntoCell(page, 'I2', '1')
    await typeIntoCell(page, 'H3', 'b')
    await typeIntoCell(page, 'I3', '2')
    await createTableOver(page, 'H1', 'I3', 'Table2')

    await page.getByTestId('toolbar-btn-name-manager').click()
    await expect(dialog(page)).toBeVisible()
    await expect(tableRow(page, 'Table1')).toBeVisible()
    await expect(tableRow(page, 'Table2')).toBeVisible()

    // Exact-name collision.
    await tableRow(page, 'Table2').getByTestId('name-manager-table-rename').click()
    const input = dialog(page).getByTestId('name-manager-table-rename-input')
    await expect(input).toHaveValue('Table2')
    await input.fill('Table1')
    await dialog(page).getByTestId('name-manager-table-rename-save').click()

    const error = dialog(page).getByTestId('name-manager-tables-error')
    await expect(error).toBeVisible()
    await expect(error).toHaveAttribute('data-table-diagnostic-code', 'name-conflict')
    await expect(error).toHaveText('That name is already in use.')
    // Rejected → the row keeps its name and the editor stays open with the draft.
    await expect(tableRow(page, 'Table2')).toBeVisible()
    await expect(input).toHaveValue('Table1')

    // The mutex is case-insensitive: TABLE1 collides with Table1 too.
    await input.fill('TABLE1')
    await dialog(page).getByTestId('name-manager-table-rename-save').click()
    await expect(error).toHaveAttribute('data-table-diagnostic-code', 'name-conflict')
    await expect(tableRow(page, 'Table2')).toBeVisible()

    // Cancel leaves both tables listed under their canonical names.
    await dialog(page).getByTestId('name-manager-table-rename-cancel').click()
    await expect(dialog(page).getByTestId('name-manager-table-rename-input')).toHaveCount(0)
    await expect(tableRow(page, 'Table1')).toBeVisible()
    await expect(tableRow(page, 'Table2')).toBeVisible()
  })
})
