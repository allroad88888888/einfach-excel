import { expect, test, type Page } from '@playwright/test'

import { cell, cellDisplay, withEnglishLocale } from '../helpers'

/**
 * Remove Duplicates — DISPLAY-VALUE equality, the ROADMAP-locked semantics
 * (`spreadsheet-ui-core/src/remove-duplicates/README.md` § Comparison policy):
 * rows are judged by the projection's formatted `displayValue`, never by the
 * underlying typed value. Both directions are pinned here on the Wave 5
 * static demo:
 *
 *   1. number `1` vs formula text `="1"` — different kinds, SAME display
 *      ("1") → they ARE duplicates.
 *   2. `1` vs `1.0` — numerically equal, DIFFERENT display ("1" vs "1.0",
 *      the static backend keeps the raw input as the display) → they are
 *      NOT duplicates.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')
}

async function seedCell(page: Page, addr: string, value: string) {
  await cell(page, addr).click()
  await page.keyboard.type(value)
  await page.keyboard.press('Enter')
}

async function selectRange(page: Page, anchor: string, focus: string) {
  await cell(page, anchor).click()
  await cell(page, focus).click({ modifiers: ['Shift'] })
}

async function openDialogFromDataMenu(page: Page) {
  await page.getByTestId('menu-bar-button-data').click()
  await expect(page.getByTestId('menu-bar-dropdown-data')).toBeVisible()
  const menuItem = page.getByTestId('menu-bar-item-data.removeDuplicates')
  await expect(menuItem).toBeEnabled()
  await menuItem.click()
  await expect(page.getByTestId('wave5-remove-duplicates')).toBeVisible()
}

test.describe('remove-duplicates — display-value equality (ROADMAP-locked)', () => {
  test('number 1 and text ="1" share a display so they ARE duplicates', async ({ page }) => {
    await gotoWave5(page)

    // G2 is the number 1; G3 is a formula producing the TEXT "1"; G4 is the
    // number 1 typed as `1.0`, whose display keeps the raw input.
    await seedCell(page, 'G1', 'k')
    await seedCell(page, 'G2', '1')
    await seedCell(page, 'G3', '="1"')
    await seedCell(page, 'G4', '1.0')

    // Sanity: the grid displays make the tuple keys visible. G2 and G3 read
    // identically; G4 does not.
    await expect(cellDisplay(page, 'G2')).toHaveText('1')
    await expect(cellDisplay(page, 'G3')).toHaveText('1')
    await expect(cellDisplay(page, 'G4')).toHaveText('1.0')

    await selectRange(page, 'G1', 'G4')
    await openDialogFromDataMenu(page)

    // Exactly ONE duplicate (the text "1") out of 3 scanned data rows: the
    // display tie is what matters, the number/text kind split does not.
    const preview = page.getByTestId('remove-duplicates-preview')
    await expect(preview).toContainText('Will remove 1 of 3 rows')
    await expect(page.getByTestId('remove-duplicates-confirm-button')).toBeEnabled()

    await page.getByTestId('remove-duplicates-confirm-button').click()
    await expect(page.getByTestId('wave5-remove-duplicates')).toHaveCount(0)

    // First occurrence wins: the number 1 (G2) survives, the text "1" row is
    // removed, and 1.0 shifts up into its slot.
    await expect(cellDisplay(page, 'G2')).toHaveText('1')
    await expect(cellDisplay(page, 'G3')).toHaveText('1.0')
    await expect(cellDisplay(page, 'G4')).toHaveText('')
  })

  test('1 and 1.0 are numerically equal but display-distinct so they are NOT duplicates', async ({
    page,
  }) => {
    await gotoWave5(page)

    await seedCell(page, 'G1', 'k')
    await seedCell(page, 'G2', '1')
    await seedCell(page, 'G3', '1.0')

    await expect(cellDisplay(page, 'G2')).toHaveText('1')
    await expect(cellDisplay(page, 'G3')).toHaveText('1.0')

    await selectRange(page, 'G1', 'G3')
    await openDialogFromDataMenu(page)

    // "Compare what the user sees": equal numbers with different formatted
    // text stay distinct — no duplicates, confirm disabled.
    const preview = page.getByTestId('remove-duplicates-preview')
    await expect(preview).toContainText('No duplicates found')
    await expect(page.getByTestId('remove-duplicates-confirm-button')).toBeDisabled()

    await page.getByTestId('remove-duplicates-cancel-button').click()
    await expect(page.getByTestId('wave5-remove-duplicates')).toHaveCount(0)

    // Nothing was touched.
    await expect(cellDisplay(page, 'G2')).toHaveText('1')
    await expect(cellDisplay(page, 'G3')).toHaveText('1.0')
  })
})
