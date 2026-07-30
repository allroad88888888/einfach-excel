import { test, expect, type Page } from '@playwright/test'
import { gotoRoot } from '../helpers'

/**
 * Formula autocomplete — keyboard acceptance paths not covered by
 * formula-flow.spec.ts (which owns open/ArrowDown/Tab/mouse/Esc/Backspace
 * and the signature tooltip).
 *
 * Covers (CASES.md FML-29 … FML-31):
 *  - Enter accepts the highlighted suggestion instead of committing the cell
 *    (grid editor onKeyDown treats Tab and Enter identically while the
 *    suggestion list is open — SpreadsheetGrid.tsx editor keydown).
 *  - ArrowUp wraps the cursor from the first suggestion to the last
 *    (`(current - 1 + len) % len` in the editor keydown).
 *  - A fragment with no matching spec closes the popup silently while the
 *    editing session stays alive (`rankSuggestions` returns [] → list gone).
 *
 * Runs on the Wave 5 static demo — the suggestion registry
 * (`FORMULA_FUNCTION_SPECS`) is backend-independent, and for the `SU`
 * fragment it contains exactly SUM and SUMIF, which makes the wrap
 * assertions deterministic.
 */

async function gotoWave5(page: Page) {
  await gotoRoot(page)
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(
    page.locator('[data-testid="wave5-grid"] td.cell[data-cell-addr="B2"] .cell-display'),
  ).toHaveText('120')
}

function cell(page: Page, addr: string) {
  return page.locator(`[data-testid="wave5-grid"] td.cell[data-cell-addr="${addr}"]`)
}

function cellInput(page: Page, addr: string) {
  return cell(page, addr).locator('.cell-input')
}

test.describe('formula autocomplete — keyboard acceptance', () => {
  test('Enter accepts the highlighted suggestion instead of committing the cell', async ({
    page,
  }) => {
    await gotoWave5(page)
    await cell(page, 'H6').click()
    await page.keyboard.type('=SU')

    await expect(page.getByTestId('formula-autocomplete-list')).toBeVisible()
    await expect(page.getByTestId('formula-autocomplete-row-SUM')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // Enter while the popup is open must splice `SUM(` — NOT commit `=SU`
    // to the cell. The editing input staying mounted with the spliced
    // draft is the user-visible proof no commit happened.
    await page.keyboard.press('Enter')
    await expect(cellInput(page, 'H6')).toHaveValue('=SUM(')
    await expect(cell(page, 'H6')).toHaveAttribute('data-active', 'true')
    // Post-accept the caret sits inside the paren → signature mode.
    await expect(page.getByTestId('formula-autocomplete-signature')).toBeVisible()
  })

  test('ArrowUp wraps the cursor from the first suggestion to the last', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'H7').click()
    await page.keyboard.type('=SU')

    // `SU` matches exactly [SUM, SUMIF]; the cursor starts on SUM.
    await expect(page.getByTestId('formula-autocomplete-row-SUM')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // ArrowUp from index 0 wraps to the end of the list (SUMIF).
    await page.keyboard.press('ArrowUp')
    await expect(page.getByTestId('formula-autocomplete-row-SUMIF')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByTestId('formula-autocomplete-row-SUM')).toHaveAttribute(
      'aria-selected',
      'false',
    )

    // ArrowDown wraps forward again → back to SUM.
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('formula-autocomplete-row-SUM')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  test('fragment with no match closes the popup while editing stays active', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'H8').click()
    await page.keyboard.type('=SU')
    await expect(page.getByTestId('formula-autocomplete-list')).toBeVisible()

    // `SUMZ` matches no spec → the popup collapses silently. The editing
    // session must keep the typed draft — no accept, no commit, no reset.
    await page.keyboard.type('MZ')
    await expect(page.getByTestId('formula-autocomplete-list')).toHaveCount(0)
    await expect(cellInput(page, 'H8')).toHaveValue('=SUMZ')
    await expect(cell(page, 'H8')).toHaveAttribute('data-active', 'true')
  })
})
