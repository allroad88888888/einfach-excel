import { expect, test, type Page } from '@playwright/test'
import { cell, expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

/**
 * FR-08..FR-11 (CASES.md): the find-option toggle matrix on the Wave 5
 * static demo — case sensitivity, whole-cell match, regex, and the
 * no-match notice. All assertions read the user-visible status line
 * (`find-status-text`, EN catalog: '{current} of {total}' / 'No
 * matches') plus `data-active` on the focused match.
 *
 * Literal-search semantics pinned here (static-backend
 * `collectLiteralFindSpans`): at most ONE span per cell (first
 * occurrence), `wholeMatch` means the ENTIRE cell text equals the
 * needle, and the default search is case-insensitive.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

async function openFindDialog(page: Page) {
  await cell(page, 'A1').click()
  await page.getByTestId('toolbar-btn-find-replace').click()
  await expect(page.getByTestId('wave5-find-replace')).toBeVisible()
}

function needleInput(page: Page) {
  return page.getByTestId('find-needle-input')
}

function statusText(page: Page) {
  return page.getByTestId('find-status-text')
}

/** Fill the needle and run the search via Enter (commits query + options). */
async function search(page: Page, needle: string) {
  const input = needleInput(page)
  await input.fill(needle)
  await input.press('Enter')
}

test.describe('Find options matrix — case / whole-cell / regex / no-match', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('case-sensitive toggle flips "north" from hit to no-match and back', async ({ page }) => {
    await gotoWave5(page)
    await openFindDialog(page)

    // Default search is case-insensitive: "north" finds the "North" cell.
    await search(page, 'north')
    await expect(statusText(page)).toHaveText('1 of 1')
    await expect(cell(page, 'A2')).toHaveAttribute('data-active', 'true')

    // Same needle with case sensitivity on → zero matches.
    await page.getByTestId('find-opt-case-sensitive').check()
    await search(page, 'north')
    await expect(statusText(page)).toHaveText('No matches')

    // Exact casing matches again while the option stays on.
    await search(page, 'North')
    await expect(statusText(page)).toHaveText('1 of 1')
    await expect(cell(page, 'A2')).toHaveAttribute('data-active', 'true')
  })

  test('whole-cell match narrows the "50" substring hits to the exact cell', async ({ page }) => {
    await gotoWave5(page)
    await openFindDialog(page)

    // Substring "50" hits 6 seeded cells (50, 150, 250, 500, 500, 5050).
    await search(page, '50')
    await expect(statusText(page)).toHaveText('1 of 6')
    // First match in (row, col) order is D4 — East Q3 = 50.
    await expect(cell(page, 'D4')).toHaveAttribute('data-active', 'true')

    // Whole-cell match keeps only the cell whose entire text is "50".
    await page.getByTestId('find-opt-whole-match').check()
    await search(page, '50')
    await expect(statusText(page)).toHaveText('1 of 1')
    await expect(cell(page, 'D4')).toHaveAttribute('data-active', 'true')
  })

  test('regex search matches anchored alternation across the totals column', async ({ page }) => {
    await gotoWave5(page)
    await openFindDialog(page)

    await page.getByTestId('find-opt-regex').check()
    // ^8[04]0$ matches exactly the cells "840" (F2) and "800" (F3);
    // "80" (B3) and "870" (B9) must not match.
    await search(page, '^8[04]0$')
    await expect(statusText(page)).toHaveText('1 of 2')
    await expect(cell(page, 'F2')).toHaveAttribute('data-active', 'true')

    // Step to the second regex match to prove the cursor walks the set.
    await page.getByTestId('find-next-button').click()
    await expect(statusText(page)).toHaveText('2 of 2')
    await expect(cell(page, 'F3')).toHaveAttribute('data-active', 'true')
  })

  test('a needle with zero hits shows the No matches notice', async ({ page }) => {
    await gotoWave5(page)
    await openFindDialog(page)

    await search(page, 'zebra')
    await expect(statusText(page)).toHaveText('No matches')

    // The dialog stays open and a corrected needle recovers immediately.
    await search(page, 'Pacific')
    await expect(statusText(page)).toHaveText('1 of 1')
    await expect(cell(page, 'A8')).toHaveAttribute('data-active', 'true')
  })
})
