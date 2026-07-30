import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  grantClipboard,
  guardConsoleErrors,
  withEnglishLocale,
} from '../helpers'

/**
 * FR-13 / FR-14 (CASES.md): the MAX_FIND_PAGE = 500 cap on replace-all,
 * and the (currently missing) single-undo-step contract.
 *
 * The 640-hit corpus is built with ONE external-TSV paste (40 rows x 16
 * cols of "zz" anchored at A1) instead of 640 cell edits — the unmarked
 * external paste path is already pinned by
 * clipboard/external-paste-matrix.spec.ts. Searching "zz" then yields
 * totalCount 640 with a 500-entry match page, so one replace-all click
 * rewrites exactly the first page and surfaces the capped notice
 * (`replace-all-capped-text`); a second click drains the remaining 140.
 */

const TSV_ROWS = 40
const TSV_COLS = 16
const TOTAL_HITS = TSV_ROWS * TSV_COLS // 640 — over the 500 page cap

async function gotoWave5(page: Page, context: BrowserContext) {
  await grantClipboard(context)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')
}

async function pasteCorpusAtA1(page: Page) {
  const row = Array.from({ length: TSV_COLS }, () => 'zz').join('\t')
  const payload = Array.from({ length: TSV_ROWS }, () => row).join('\n')
  await page.evaluate((text) => navigator.clipboard.writeText(text), payload)

  await cell(page, 'A1').click()
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${meta}+v`)
  await expect(cellDisplay(page, 'A1')).toHaveText('zz', { timeout: 15_000 })
}

async function openFindDialog(page: Page) {
  await page.getByTestId('toolbar-btn-find-replace').click()
  await expect(page.getByTestId('wave5-find-replace')).toBeVisible()
}

function statusText(page: Page) {
  return page.getByTestId('find-status-text')
}

test.describe('Replace-all — 500-match page cap', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('replace-all over 640 hits caps at 500 with the notice; second pass drains it', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)
    await pasteCorpusAtA1(page)
    await openFindDialog(page)

    // Search finds all 640 hits; the cursor page holds the first 500.
    await page.getByTestId('find-needle-input').fill('zz')
    await page.getByTestId('find-next-button').click()
    await expect(statusText(page)).toHaveText(`1 of ${TOTAL_HITS}`, { timeout: 15_000 })

    const dialog = page.getByTestId('wave5-find-replace')
    await dialog.getByTestId('replace-tab').click()
    await dialog.getByTestId('find-replacement-input').fill('yy')
    await dialog.getByTestId('replace-all-button').click()

    // The capped notice reports the acknowledged page vs the true total.
    await expect(page.getByTestId('replace-all-capped-text')).toHaveText(
      `Local projection acknowledged 500 of ${TOTAL_HITS} matches; ` +
        'canonical workbook state is not confirmed.',
      { timeout: 15_000 },
    )
    // The post-replace recovery re-search finds the 140 untouched hits and
    // scrolls the virtualized viewport to the first of them (E32) — the
    // sorted page covers rows 1..31 plus A32..D32, so the cap boundary
    // sits inside row 32 and both sides of it are now in the DOM.
    await expect(statusText(page)).toHaveText(`1 of ${TOTAL_HITS - 500}`, { timeout: 15_000 })
    await expect(cellDisplay(page, 'D32')).toHaveText('yy')
    await expect(cellDisplay(page, 'E32')).toHaveText('zz')

    // Second replace-all pass drains the remainder ("run again for the rest").
    await dialog.getByTestId('replace-all-button').click()
    await expect(statusText(page)).toHaveText('No matches', { timeout: 15_000 })
    await expect(cellDisplay(page, 'E32')).toHaveText('yy')
  })
})

test.describe('Replace-all — undo integration', () => {
  /**
   * FR-14 ⚠️ (CASES.md): Excel semantics say one replace-all is ONE undo
   * step. The vNext replace flow acknowledges through the backend
   * `replaceMatches` port but records NO ui-core history entry
   * (`recordHistoryEntry` has zero call sites; the find-replace module
   * has zero history integration), so `canUndoAtom` never learns about
   * the mutation: the toolbar undo button stays disabled and the
   * replacement cannot be reverted at all. Static backend even journals
   * the delta (`beginUndoableMutation`) — the wiring gap is UI-side.
   * Fixme until the product records the entry; the body encodes the
   * expected contract.
   */
  test.fixme('replace-all is one undo step: a single undo restores every match', async ({
    page,
  }) => {
    guardConsoleErrors(page)
    await page.goto(withEnglishLocale())
    await page.getByTestId('nav-tab-vnext-wave5').click()
    await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
    await expect(cellDisplay(page, 'B2')).toHaveText('120')

    await cell(page, 'A1').click()
    await openFindDialog(page)
    await page.getByTestId('find-needle-input').fill('240')
    await page.getByTestId('find-next-button').click()
    await expect(cell(page, 'D2')).toHaveAttribute('data-active', 'true')

    const dialog = page.getByTestId('wave5-find-replace')
    await dialog.getByTestId('replace-tab').click()
    await dialog.getByTestId('find-replacement-input').fill('888')
    await dialog.getByTestId('replace-all-button').click()
    await expect(cellDisplay(page, 'D2')).toHaveText('888')
    await expect(cellDisplay(page, 'D3')).toHaveText('888')

    // Expected: the mutation registered exactly one history entry.
    const undoButton = page.getByTestId('toolbar-btn-undo')
    await expect(undoButton).toBeEnabled()
    await undoButton.click()

    // One undo restores BOTH cells (single transaction semantics).
    await expect(cellDisplay(page, 'D2')).toHaveText('240')
    await expect(cellDisplay(page, 'D3')).toHaveText('240')
  })
})
