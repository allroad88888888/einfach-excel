import { expect, test, type Page } from '@playwright/test'

import { cell, cellDisplay, expectNoConsoleErrors, grantClipboard, typeIntoCell } from '../helpers'
import {
  activeProjectIsWasm,
  clearFilterViaChevron,
  gotoWorkerDemo,
  uncheckValueFilter,
} from './worker-demo-helpers'

/**
 * Clipboard paste while a filter is ACTIVE, on the real WASM worker.
 *
 * Product behavior under #27 hidden-row semantics: paste targets PHYSICAL
 * rows counted from the anchor — the clipboard layer has no hidden-row
 * awareness (`spreadsheet-ui-core/src/clipboard/index.ts` writes
 * `chunkTargetOrigin.row + rowOffset` blindly), so a multi-row paste whose
 * span crosses a filter-hidden row WRITES THROUGH it. The hidden row stays
 * unmounted until the filter clears, then surfaces the pasted value.
 *
 * That is asserted as-is (the brief: pin the actual landing behavior, not an
 * aspiration). Note the contrast with Excel, which skips hidden rows when
 * pasting over a filtered range — if the product ever converges on that,
 * this spec is the one that flips.
 *
 * WASM-only: the filter predicate is engine-owned since E5, so the TS worker
 * fail-closes the filter button and the scenario cannot be built there.
 */

async function pressClipboardShortcut(page: Page, key: 'c' | 'v') {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${modifier}+${key}`)
}

/** Seed the filter key column: E1 header, E2..E4 = 10/20/30. */
async function seedFilterColumn(page: Page) {
  await typeIntoCell(page, 'E1', 'Val')
  await typeIntoCell(page, 'E2', '10')
  await typeIntoCell(page, 'E3', '20')
  await typeIntoCell(page, 'E4', '30')
}

test.describe('vNext filter + paste landing — real worker backend', () => {
  test.beforeEach(async ({ context }) => {
    test.skip(
      !activeProjectIsWasm(),
      'the filter predicate is engine-owned — TS worker fail-closes',
    )
    await grantClipboard(context)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('a multi-row paste anchored on a visible row writes through the filter-hidden row', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await seedFilterColumn(page)
    // Paste source: a 3-row column block.
    await typeIntoCell(page, 'G2', 'p1')
    await typeIntoCell(page, 'G3', 'p2')
    await typeIntoCell(page, 'G4', 'p3')

    // Copy G2:G4 BEFORE filtering so the payload is unambiguous.
    await cell(page, 'G2').click()
    await cell(page, 'G4').click({ modifiers: ['Shift'] })
    await pressClipboardShortcut(page, 'c')
    await expect(page.getByTestId('status-last-command')).toHaveText('Clipboard copy')

    // Hide the middle data row: uncheck 20 → source row 2 (screen row 3).
    await uncheckValueFilter(page, 4, '20')
    await expect(cell(page, 'E3')).toHaveCount(0)
    await expect(cellDisplay(page, 'E2')).toHaveText('10')
    await expect(cellDisplay(page, 'E4')).toHaveText('30')

    // Paste anchored on visible F2. The 3-row block lands on PHYSICAL rows
    // 2/3/4 — the hidden row 3 is written even though it is not painted.
    await cell(page, 'F2').click()
    await pressClipboardShortcut(page, 'v')
    await expect(cellDisplay(page, 'F2')).toHaveText('p1')
    await expect(cellDisplay(page, 'F4')).toHaveText('p3')
    await expect(cell(page, 'F3')).toHaveCount(0)

    // Clearing the filter surfaces what the paste did to the hidden row: it
    // received p2 (write-through), and its OWN prior data is intact.
    await clearFilterViaChevron(page, 4)
    await expect(cellDisplay(page, 'F3')).toHaveText('p2')
    await expect(cellDisplay(page, 'E3')).toHaveText('20')
    await expect(cellDisplay(page, 'E2')).toHaveText('10')
    await expect(cellDisplay(page, 'E4')).toHaveText('30')
    // The copy source never moved.
    await expect(cellDisplay(page, 'G2')).toHaveText('p1')
    await expect(cellDisplay(page, 'G3')).toHaveText('p2')
    await expect(cellDisplay(page, 'G4')).toHaveText('p3')
  })

  test('a single-cell paste onto a visible row keeps its value after the filter clears', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await seedFilterColumn(page)
    await typeIntoCell(page, 'G2', 'src')

    await cell(page, 'G2').click()
    await pressClipboardShortcut(page, 'c')
    await expect(page.getByTestId('status-last-command')).toHaveText('Clipboard copy')

    await uncheckValueFilter(page, 4, '20')
    await expect(cell(page, 'E3')).toHaveCount(0)

    // Paste on visible G4: display row IS source row (#27), so the write
    // lands exactly where the user sees it.
    await cell(page, 'G4').click()
    await pressClipboardShortcut(page, 'v')
    await expect(cellDisplay(page, 'G4')).toHaveText('src')

    // Clearing the filter neither moves the pasted value nor disturbs the
    // row that was hidden while the paste happened.
    await clearFilterViaChevron(page, 4)
    await expect(cellDisplay(page, 'G4')).toHaveText('src')
    await expect(cellDisplay(page, 'G3')).toHaveText('')
    await expect(cellDisplay(page, 'E3')).toHaveText('20')
  })
})
