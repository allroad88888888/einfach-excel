import { expect, test } from '@playwright/test'

import { cellDisplay, expectNoConsoleErrors, typeIntoCell } from '../helpers'
import {
  activeProjectIsWasm,
  gotoWorkerDemo,
  selectGridCell,
  sortHistoryEntry,
} from './worker-demo-helpers'

/**
 * Physical sort STABILITY on the real WASM worker.
 *
 * The engine guarantees a stable permutation (`excel/rust/excel-core/src/sort.rs`
 * §6.2: "sort_by is stable, so key-equal rows keep their pre-sort slot
 * order"; unit pin `stable_sort_preserves_slot_order_of_equal_keys`). This
 * spec pins the same contract end to end through the toolbar entrypoint:
 * key-equal rows keep their SOURCE relative order after ascending AND after
 * descending, and re-sorting already-sorted data moves nothing.
 *
 * Seed shape mirrors the proven `seedFilterSortScenario` in
 * `vnext-sort-real-backend.spec.ts`: column A is made contiguous A2..A5 so
 * the data-region resolution spans all four data rows, column D carries a
 * per-row witness (w1..w4, unique), and column E carries the sort key with
 * DUPLICATES (2/1/2/1). Column C is never asserted — the physical row move
 * legitimately breaks the seeded cross-sheet chain (see the sort spec's
 * "Clean sort column" note).
 *
 * History discriminator: `runPhysicalSortAtom` pushes a `range.sort` entry
 * only when `movedRows > 0` (design §7). The no-op re-sort therefore records
 * nothing, which the final entry count (2 = one asc + one desc) pins.
 */

async function seedEqualKeyRows(page: import('@playwright/test').Page) {
  // Contiguous column A so the data region reaches row 5.
  await typeIntoCell(page, 'A3', 'r3')
  await typeIntoCell(page, 'A5', 'r5')
  // Witness column D — unique per row, rides with its row.
  await typeIntoCell(page, 'D2', 'w1')
  await typeIntoCell(page, 'D3', 'w2')
  await typeIntoCell(page, 'D4', 'w3')
  await typeIntoCell(page, 'D5', 'w4')
  // Sort key column E — deliberate duplicates: rows 2/4 share 2, rows 3/5 share 1.
  await typeIntoCell(page, 'E2', '2')
  await typeIntoCell(page, 'E3', '1')
  await typeIntoCell(page, 'E4', '2')
  await typeIntoCell(page, 'E5', '1')
}

async function toolbarSort(page: import('@playwright/test').Page, direction: 'asc' | 'desc') {
  await selectGridCell(page, 'E5')
  const sortButton = page.getByTestId('toolbar-btn-sort')
  await expect(sortButton).toBeEnabled()
  await sortButton.click()
  await expect(page.getByTestId('toolbar-sort-dropdown')).toBeVisible()
  await page.getByTestId(`toolbar-sort-${direction}`).click()
  await expect(page.getByTestId('toolbar-sort-dropdown')).toBeHidden()
}

test.describe('vNext physical sort — stability on equal keys', () => {
  test.beforeEach(() => {
    test.skip(!activeProjectIsWasm(), 'physical engine sort is the WASM backend contract')
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('equal-key rows keep source order under asc and desc, and a re-sort moves nothing', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await seedEqualKeyRows(page)

    // Ascending. Key ties resolve by SOURCE order: the two 1-rows arrive as
    // (row3 w2) then (row5 w4); the two 2-rows as (row2 w1) then (row4 w3).
    await toolbarSort(page, 'asc')
    await expect(cellDisplay(page, 'E2')).toHaveText('1')
    await expect(cellDisplay(page, 'E3')).toHaveText('1')
    await expect(cellDisplay(page, 'E4')).toHaveText('2')
    await expect(cellDisplay(page, 'E5')).toHaveText('2')
    await expect(cellDisplay(page, 'D2')).toHaveText('w2')
    await expect(cellDisplay(page, 'D3')).toHaveText('w4')
    await expect(cellDisplay(page, 'D4')).toHaveText('w1')
    await expect(cellDisplay(page, 'D5')).toHaveText('w3')
    // Whole-row move witness: column A traveled with its rows.
    await expect(cellDisplay(page, 'A2')).toHaveText('r3')
    await expect(cellDisplay(page, 'A3')).toHaveText('r5')
    await expect(cellDisplay(page, 'A4')).toHaveText('cell1')
    await expect(cellDisplay(page, 'A5')).toHaveText('cell4')
    await expect(sortHistoryEntry(page)).toHaveCount(1)

    // Re-sort ascending: the data is already in order, so a STABLE sort is a
    // pure no-op — nothing moves. (History accounting for this click is pinned
    // by the final entry count below.)
    await toolbarSort(page, 'asc')
    await expect(cellDisplay(page, 'D2')).toHaveText('w2')
    await expect(cellDisplay(page, 'D3')).toHaveText('w4')
    await expect(cellDisplay(page, 'D4')).toHaveText('w1')
    await expect(cellDisplay(page, 'D5')).toHaveText('w3')

    // Descending is stable too: the 2-rows keep their CURRENT relative order
    // (w1 before w3), then the 1-rows keep theirs (w2 before w4).
    await toolbarSort(page, 'desc')
    await expect(cellDisplay(page, 'E2')).toHaveText('2')
    await expect(cellDisplay(page, 'E3')).toHaveText('2')
    await expect(cellDisplay(page, 'E4')).toHaveText('1')
    await expect(cellDisplay(page, 'E5')).toHaveText('1')
    await expect(cellDisplay(page, 'D2')).toHaveText('w1')
    await expect(cellDisplay(page, 'D3')).toHaveText('w3')
    await expect(cellDisplay(page, 'D4')).toHaveText('w2')
    await expect(cellDisplay(page, 'D5')).toHaveText('w4')

    // Exactly TWO range.sort entries: asc + desc. The no-op re-sort recorded
    // nothing (movedRows === 0 pushes no history entry, design §7).
    await expect(sortHistoryEntry(page)).toHaveCount(2)
  })
})
