import { expect, test, type Page } from '@playwright/test'

import { cellDisplay, expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * Multi-level outline grouping on the worker demos (CASES.md RC-16/17).
 *
 * vnext-outline-real-backend.spec.ts covers a single group; these cases nest
 * a level-2 group inside a level-1 band and pin the Excel semantics from
 * `spreadsheet-ui-core/src/outline/index.ts`:
 *  - levels derive from containment (outer [1,4] = 1, inner [2,3] = 2) and
 *    each toggle sits on its own summary row;
 *  - collapsing a band hides everything inside it, nested toggles included;
 *  - level button N collapses every group at derived level >= N and expands
 *    the shallower ones; max+1 expands all;
 *  - ungroup peels ONE level: only the innermost groups inside the selection.
 *
 * Outline is UI-core canonical, so this runs on BOTH worker backends.
 * Fixture (20-row demo, ~6 visible rows): outer group rows 2-5, inner rows
 * 3-4 — toggles land on summary rows 5 and 6, inside the visible window.
 */

async function gotoWorkerDemo(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

function rowHeader(page: Page, row: number) {
  return page.locator(`th.spreadsheet-grid-row-header[data-row="${row}"]`)
}

function rowHeaderLabels(page: Page) {
  return page.locator('th.spreadsheet-grid-row-header .spreadsheet-grid-header-label')
}

async function groupRows(page: Page, startRow: number, endRow: number) {
  await rowHeader(page, startRow).click()
  await rowHeader(page, endRow).click({ modifiers: ['Shift'] })
  await page.getByTestId('menu-bar-button-data').click()
  await expect(page.getByTestId('menu-bar-dropdown-data')).toBeVisible()
  await page.getByTestId('menu-bar-item-data.groupRows').click()
  await expect(page.getByTestId('menu-bar-dropdown-data')).toHaveCount(0)
}

/** Outer group over rows 2-5 (indices 1-4), inner group over rows 3-4 (2-3). */
async function buildNestedGroups(page: Page) {
  await groupRows(page, 1, 4)
  await expect(page.getByTestId('outline-row-toggle-1-4')).toBeVisible()
  await groupRows(page, 2, 3)
  await expect(page.getByTestId('outline-row-toggle-2-3')).toBeVisible()
}

test.describe('vNext multi-level outline real-backend evidence', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('nested groups collapse and expand independently, outer collapse swallows the inner toggle', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await buildNestedGroups(page)

    // Nesting is visible in the level rail: buttons 1..maxLevel+1.
    await expect(page.getByTestId('outline-row-level-1')).toBeVisible()
    await expect(page.getByTestId('outline-row-level-2')).toBeVisible()
    await expect(page.getByTestId('outline-row-level-3')).toBeVisible()

    // Collapse the INNER group only: rows 3-4 vanish, rows 2 and 5 stay.
    await page.getByTestId('outline-row-toggle-2-3').click()
    await expect(rowHeader(page, 2)).toHaveCount(0)
    await expect(rowHeader(page, 3)).toHaveCount(0)
    await expect(rowHeaderLabels(page).nth(1)).toHaveText('2')
    await expect(rowHeaderLabels(page).nth(2)).toHaveText('5')
    await expect(cellDisplay(page, 'A2')).toHaveText('cell1')

    // Expand it again: the band returns.
    await page.getByTestId('outline-row-toggle-2-3').click()
    await expect(rowHeader(page, 2)).toBeVisible()
    await expect(rowHeaderLabels(page).nth(2)).toHaveText('3')

    // Collapse the OUTER group: the whole 2-5 band vanishes, and the inner
    // toggle goes with it (its summary row sits inside the outer band).
    await page.getByTestId('outline-row-toggle-1-4').click()
    await expect(rowHeader(page, 1)).toHaveCount(0)
    await expect(rowHeaderLabels(page).nth(1)).toHaveText('6')
    await expect(page.getByTestId('outline-row-toggle-2-3')).toHaveCount(0)

    // Expand the outer: everything returns, nested toggle included and
    // still expanded — inner state survived the outer collapse.
    await page.getByTestId('outline-row-toggle-1-4').click()
    await expect(rowHeaderLabels(page).nth(1)).toHaveText('2')
    await expect(cellDisplay(page, 'A2')).toHaveText('cell1')
    await expect(page.getByTestId('outline-row-toggle-2-3')).toHaveAttribute(
      'data-collapsed',
      'false',
    )
  })

  test('level buttons collapse by depth and ungroup peels the innermost level', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await buildNestedGroups(page)

    // Level 1: every group at level >= 1 collapses — the sheet jumps 1 → 6.
    await page.getByTestId('outline-row-level-1').click()
    await expect(rowHeaderLabels(page).nth(1)).toHaveText('6')
    await expect(page.getByTestId('outline-row-toggle-1-4')).toHaveAttribute(
      'data-collapsed',
      'true',
    )

    // Level 3 (max+1): expands everything back.
    await page.getByTestId('outline-row-level-3').click()
    await expect(rowHeaderLabels(page).nth(1)).toHaveText('2')
    await expect(rowHeaderLabels(page).nth(2)).toHaveText('3')

    // Level 2: only the inner (level-2) group collapses; the outer expands.
    await page.getByTestId('outline-row-level-2').click()
    await expect(rowHeaderLabels(page).nth(1)).toHaveText('2')
    await expect(rowHeaderLabels(page).nth(2)).toHaveText('5')
    await expect(page.getByTestId('outline-row-toggle-2-3')).toHaveAttribute(
      'data-collapsed',
      'true',
    )
    await expect(page.getByTestId('outline-row-toggle-1-4')).toHaveAttribute(
      'data-collapsed',
      'false',
    )

    // Ungroup peels ONE level: expand all, then remove the inner group only.
    await page.getByTestId('outline-row-level-3').click()
    await expect(rowHeader(page, 2)).toBeVisible()
    await rowHeader(page, 2).click()
    await rowHeader(page, 3).click({ modifiers: ['Shift'] })
    await page.getByTestId('menu-bar-button-data').click()
    await expect(page.getByTestId('menu-bar-dropdown-data')).toBeVisible()
    await page.getByTestId('menu-bar-item-data.ungroupRows').click()
    await expect(page.getByTestId('menu-bar-dropdown-data')).toHaveCount(0)

    await expect(page.getByTestId('outline-row-toggle-2-3')).toHaveCount(0)
    await expect(page.getByTestId('outline-row-level-3')).toHaveCount(0)
    await expect(page.getByTestId('outline-row-toggle-1-4')).toBeVisible()
  })
})
