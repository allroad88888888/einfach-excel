import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
  selectSheet,
  typeIntoCell,
} from '../helpers'

/**
 * Undo/redo branch + cross-sheet semantics on the vNext Worker demo (real
 * backends, both projects).
 *
 * 1. A new edit after undo TRUNCATES the redo tail: `pushHistoryAtom`
 *    slices `entries[0..cursor]` before appending, so the undone entry
 *    becomes unreachable and redo must be a no-op afterwards.
 * 2. A cross-sheet undo replays the entry on the sheet it was recorded on
 *    (`entry.sheetId`) but does NOT navigate the view. This is the actual
 *    implemented contract: `src-vnext/provider/history-dispatch.ts` only
 *    reconciles caches and refreshes projections for the entry's sheet —
 *    no code path switches the active sheet. Asserted as-is.
 */

async function gotoWorkerDemo(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  // Cross-sheet seed settles (Sheet1!C2 = Sheet2!C2 + 1 → 13) — the demo is live.
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

test.describe('vNext worker history — redo branch + cross-sheet undo', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('a new edit after undo clears the redo tail on the backend history', async ({ page }) => {
    await gotoWorkerDemo(page)
    const cursor = page.getByTestId('history-timeline-cursor')
    const redoBtn = page.getByTestId('history-timeline-redo')

    await typeIntoCell(page, 'E6', '1')
    await typeIntoCell(page, 'E6', '2')
    await expect(cursor).toHaveText('2 / 2')

    await cell(page, 'E6').click()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(cellDisplay(page, 'E6')).toHaveText('1')
    await expect(cursor).toHaveText('1 / 2')
    await expect(redoBtn).toBeEnabled()

    // Branch the timeline: the "2" entry must become unreachable.
    await typeIntoCell(page, 'E6', '9')
    await expect(cursor).toHaveText('2 / 2')
    await expect(redoBtn).toBeDisabled()

    // Ctrl+Y is a no-op after the truncation — "2" never comes back.
    await cell(page, 'E6').click()
    await page.keyboard.press('ControlOrMeta+y')
    await expect(cellDisplay(page, 'E6')).toHaveText('9')
    await expect(cursor).toHaveText('2 / 2')
  })

  test('undoing a Sheet2 edit from Sheet1 keeps the view on Sheet1 and reverts the fact', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    const cursor = page.getByTestId('history-timeline-cursor')

    // Record the only history entry on Sheet2.
    await selectSheet(page, 'Sheet2')
    await expect(cellDisplay(page, 'A1')).toHaveText('Sheet2')
    await typeIntoCell(page, 'E5', 'temp')
    await expect(cellDisplay(page, 'E5')).toHaveText('temp')
    await expect(cursor).toHaveText('1 / 1')

    // View Sheet1, then undo the Sheet2 entry from here.
    await selectSheet(page, 'Sheet1')
    await expect(cellDisplay(page, 'A1')).toHaveText('Sheet1')
    await cell(page, 'B4').click()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(cursor).toHaveText('0 / 1')

    // The view did not follow the entry: Sheet1 stays the active tab with
    // its own content on screen.
    await expect(page.locator('.sheet-tab-active')).toHaveText('Sheet1')
    await expect(cellDisplay(page, 'A1')).toHaveText('Sheet1')
    await expect(cellDisplay(page, 'C2')).toHaveText('13')

    // The fact itself reverted on the sheet the entry belongs to.
    await selectSheet(page, 'Sheet2')
    await expect(cellDisplay(page, 'E5')).toHaveText('')

    // Redo from the entry's own sheet restores the value in place.
    await cell(page, 'A2').click()
    await page.keyboard.press('ControlOrMeta+y')
    await expect(cellDisplay(page, 'E5')).toHaveText('temp')
    await expect(cursor).toHaveText('1 / 1')
  })
})
