import { test, expect, type Page } from '@playwright/test'
import { gotoRoot } from '../helpers'

/**
 * Formula reference picking via the keyboard (Excel's arrow-key point
 * mode). Zero prior e2e coverage — formula-flow.spec.ts only exercises
 * the pointer paths (click / drag picks).
 *
 * Implementation under test:
 *  - `shouldEnterFormulaReferenceMode` auto-enters the ref session when
 *    the caret sits after `=` or an operator (formula-reference/index.ts).
 *  - keyboard mode 'formula-reference' turns ArrowUp/Down/Left/Right into
 *    `formulaReference.arrowPick` intents (keyboard/index.ts), which the
 *    grid resolves against the session anchor cell and splices via
 *    `pickFormulaReferenceAtom` (SpreadsheetGrid.tsx).
 *  - Typing an operator exits the pick session and re-arms it at the new
 *    caret (`notifyDraftTypedChar`), so the next arrow press splices a
 *    fresh ref instead of replacing the previous one.
 *
 * Known simplification (CASES.md FML-35): the grid does not persist the
 * pick focus, so repeated arrow presses re-pick anchor±1 rather than
 * walking further — these tests only press each arrow once per pick.
 *
 * ⚠️ ALL THREE TESTS ARE test.fixme — verified 2026-07-29 on the wasm
 * project: the draft stays `=` after ArrowLeft/ArrowUp. Root cause: the
 * arrow keys land on the cell editor `<input>`, whose onKeyDown has no
 * ref-pick branch, and `handleGridKeyDown` (SpreadsheetGrid.tsx:2499)
 * early-returns for INPUT targets — so the `formulaReference.arrowPick`
 * case in the grid switch (SpreadsheetGrid.tsx:2732) and the arrow arms
 * of `getFormulaReferenceModeIntent` (keyboard/index.ts:215) are
 * unreachable while an editor owns focus, i.e. always. The plumbing
 * exists end-to-end but is wired off; see CASES.md FML-32…34.
 *
 * Wave 5 seed (VNextWave5Demo.tsx): A1:F9 matrix, row 2 North … F2=840,
 * row 3 South … F3=800, row 9 Total B9=870. Columns G/H are empty.
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

function display(page: Page, addr: string) {
  return cell(page, addr).locator('.cell-display')
}

function cellInput(page: Page, addr: string) {
  return cell(page, addr).locator('.cell-input')
}

test.describe('formula reference — keyboard arrow picking', () => {
  test.fixme('"=" then ArrowLeft splices the left neighbor and Enter commits', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'G2').click()
    await page.keyboard.press('=')
    await expect(cellInput(page, 'G2')).toHaveValue('=')

    // Caret sits after `=` → ref session is armed; ArrowLeft picks the
    // cell one column left of the anchor (G2 → F2).
    await page.keyboard.press('ArrowLeft')
    await expect(cellInput(page, 'G2')).toHaveValue('=F2')
    // The pick must not steal the editing anchor.
    await expect(cell(page, 'G2')).toHaveAttribute('data-active', 'true')

    await page.keyboard.press('Enter')
    await expect(cellInput(page, 'G2')).toHaveCount(0)
    // F2 is the seeded North total.
    await expect(display(page, 'G2')).toHaveText('840')
  })

  test.fixme('"=" then ArrowUp splices the cell above and Enter commits', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'B10').click()
    await page.keyboard.press('=')
    await expect(cellInput(page, 'B10')).toHaveValue('=')

    await page.keyboard.press('ArrowUp')
    await expect(cellInput(page, 'B10')).toHaveValue('=B9')

    await page.keyboard.press('Enter')
    await expect(cellInput(page, 'B10')).toHaveCount(0)
    // B9 is the seeded Q1 grand total.
    await expect(display(page, 'B10')).toHaveText('870')
  })

  test.fixme('operator after a keyboard pick appends a second ref instead of replacing', async ({
    page,
  }) => {
    await gotoWave5(page)
    await cell(page, 'G3').click()
    await page.keyboard.press('=')
    await page.keyboard.press('ArrowLeft')
    await expect(cellInput(page, 'G3')).toHaveValue('=F3')

    // Typing `+` exits the pick session and re-arms it at the new caret;
    // the next ArrowLeft splices a fresh ref (anchor G3 → F3 again)
    // instead of replacing the first token.
    await page.keyboard.press('+')
    await expect(cellInput(page, 'G3')).toHaveValue('=F3+')
    await page.keyboard.press('ArrowLeft')
    await expect(cellInput(page, 'G3')).toHaveValue('=F3+F3')

    await page.keyboard.press('Enter')
    // F3 = 800 (South total) → 800 + 800.
    await expect(display(page, 'G3')).toHaveText('1600')
  })
})
