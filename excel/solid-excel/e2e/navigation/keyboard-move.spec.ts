import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * NAV-01 … NAV-05 (CASES.md): navigation-mode Enter / Shift+Enter / Tab /
 * Shift+Tab movement + boundary clamping on the vNext Wave 5 grid
 * (bounds 50 rows x 16 cols, A1 … P50).
 *
 * Semantics under test come from `spreadsheet-ui-core/src/keyboard`
 * `createMoveIntent`: every movement key except Tab takes
 * `extend = shiftKey`, so Shift+Enter EXTENDS the selection upward
 * (Shift+ArrowUp parity) instead of Excel's move-up — deliberate,
 * documented in CASES.md. Tab is explicitly exempt: Shift+Tab is a plain
 * move left. Arrow-key movement itself is pinned by smoke/smoke.spec.ts;
 * this file owns the Enter/Tab family.
 */

const GRID = '[data-testid="wave5-grid"]'

function cell(page: Page, addr: string) {
  return page.locator(`${GRID} td.cell[data-cell-addr="${addr}"]`)
}

async function gotoWave5(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page, 'locale=en')
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

test.describe('Keyboard navigation — Enter / Tab movement', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Enter moves the active cell down one row and collapses the selection', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()
    await expect(cell(page, 'B2')).toHaveAttribute('data-active', 'true')

    await page.keyboard.press('Enter')

    await expect(cell(page, 'B3')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'B3')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'false')
  })

  test('Shift+Enter extends the selection one row up (Shift+ArrowUp parity)', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'B3').click()
    await page.keyboard.press('Shift+Enter')

    // Implemented semantics: anchor stays on B3, focus moves to B2 — the
    // range B2:B3 is selected with B2 active. NOT Excel's plain move-up.
    await expect(cell(page, 'B2')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B3')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B3')).toHaveAttribute('data-active', 'false')
  })

  test('Tab moves right and Shift+Tab moves back left without extending', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()

    await page.keyboard.press('Tab')
    await expect(cell(page, 'C2')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'false')

    await page.keyboard.press('Shift+Tab')
    await expect(cell(page, 'B2')).toHaveAttribute('data-active', 'true')
    // Tab movement never extends — C2 fell out of the selection again.
    await expect(cell(page, 'C2')).toHaveAttribute('data-selected', 'false')
  })

  test('movement clamps at the A1 corner (Shift+Tab and Shift+Enter stay put)', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'A1').click()

    await page.keyboard.press('Shift+Tab')
    await expect(cell(page, 'A1')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'B1')).toHaveAttribute('data-selected', 'false')

    await page.keyboard.press('Shift+Enter')
    // Extension target clamps to row 0 → the range degenerates to A1 only.
    await expect(cell(page, 'A1')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'A1')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'A2')).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'B1')).toHaveAttribute('data-selected', 'false')
  })

  test('Tab clamps at the last column (P is col 16 of the Wave 5 bounds)', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'A1').click()
    // End jumps to the last column of the row (transport — asserted in
    // detail by home-end-page.spec.ts).
    await page.keyboard.press('End')
    await expect(cell(page, 'P1')).toHaveAttribute('data-active', 'true', { timeout: 10_000 })

    await page.keyboard.press('Tab')
    await expect(cell(page, 'P1')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'O1')).toHaveAttribute('data-selected', 'false')
  })
})
