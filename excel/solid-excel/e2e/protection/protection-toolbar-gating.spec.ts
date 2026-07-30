import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  guardConsoleErrors,
  withEnglishLocale,
} from '../helpers'

/**
 * PR-04 (CASES.md): sheet protection gates the toolbar format commands
 * (`isProtectionGated` in SpreadsheetToolbar), and an unlocked range
 * re-enables them for selections fully inside it while the sheet stays
 * protected. Runs on the Wave 5 static demo so the format availability
 * itself is constant across the wasm/ts projects (the backend supports
 * setFormatRange either way — only protection flips the disabled state).
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')
}

async function clickFormatMenuItem(page: Page, itemId: string) {
  await page.getByTestId('menu-bar-button-format').click()
  await expect(page.getByTestId('menu-bar-dropdown-format')).toBeVisible()
  await page.getByTestId(`menu-bar-item-${itemId}`).click()
  await expect(page.getByTestId('menu-bar-dropdown-format')).toHaveCount(0)
}

test.describe('Protection — toolbar format gating and unlocked-range recovery', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('protect disables bold; unlocking B2 re-enables it only inside the range', async ({
    page,
  }) => {
    await gotoWave5(page)
    const bold = page.getByTestId('toolbar-btn-bold')

    await cell(page, 'B2').click()
    await expect(bold).toBeEnabled()

    // Protecting the sheet locks every cell → format commands gate off.
    await clickFormatMenuItem(page, 'format.protectSheet')
    await expect(bold).toBeDisabled()

    // Unlock exactly B2 through the Format menu dialog (no verifier
    // wired → confirm commits locally).
    await clickFormatMenuItem(page, 'format.unlockRange')
    const dialog = page.getByTestId('wave5-protection-unlock')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('protection-unlock-target')).toHaveText(
      'Worksheet sheet-1, rows 2–2, columns 2–2',
    )
    await dialog.getByTestId('protection-unlock-confirm').click()
    await expect(dialog).toHaveCount(0)

    // Selection fully inside the unlocked range → enabled again, while
    // the sheet as a whole is still protected.
    await cell(page, 'B2').click()
    await expect(bold).toBeEnabled()

    // A locked cell outside the range keeps the gate closed.
    await cell(page, 'C3').click()
    await expect(bold).toBeDisabled()

    // A range that straddles unlocked + locked cells is partial → gated.
    await cell(page, 'B2').click()
    await cell(page, 'C3').click({ modifiers: ['Shift'] })
    await expect(bold).toBeDisabled()

    // Unprotect restores the toolbar everywhere.
    await clickFormatMenuItem(page, 'format.unprotectSheet')
    await cell(page, 'C3').click()
    await expect(bold).toBeEnabled()
  })
})
