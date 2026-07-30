import { test, expect, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
  selectSheet,
} from '../helpers'

/**
 * Sheet rename/delete × cross-sheet formula references (vNext worker demo).
 *
 * Engine ground truth (excel/rust/excel-core/src/workbook.rs::rename_sheet):
 * formula ASTs store sheet NAMES and are NOT rewritten on rename or delete.
 * References spelled with the old name therefore resolve to
 * Value::Error(InvalidRef) → `#REF!` after the rename/delete, and a rename
 * back to the original name heals them. This diverges from Excel (which
 * rewrites references to follow a rename); the divergence is registered in
 * CASES.md (MS-16) — these specs pin the ACTUAL current behavior.
 *
 * Seeds (VNextWorkerDemo.tsx::seedWorkerWorkbook):
 *   Sheet1!C2 = =Sheet2!C2+1 → 13     Sheet2!C2 = =Sheet3!C2+1 → 12
 *   Sheet2!C5 = =Sheet3!B4+5 → 105    Sheet3!C2 = =Sheet1!B4+1 → 11
 */

async function gotoWorkerDemo(page: Page) {
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

function sheetTabs(page: Page) {
  return page.getByTestId('vnext-worker-sheet-tabs')
}

function tab(page: Page, name: string) {
  return sheetTabs(page).getByRole('tab', { name, exact: true })
}

function renameInput(page: Page) {
  return page.locator('input.spreadsheet-sheet-tab-rename')
}

async function renameSheetViaTab(page: Page, from: string, to: string) {
  await tab(page, from).dblclick()
  const input = renameInput(page)
  await expect(input).toBeVisible()
  await input.fill(to)
  await input.press('Enter')
}

test.describe('Sheet rename/delete — cross-sheet formula reference behavior', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('renaming a referenced sheet breaks old-name refs to #REF! until renamed back', async ({
    page,
  }) => {
    // ⚠️ MS-20 — data loss on the TS worker backend only (CI shard 4/4,
    // 2026-07-30): renaming a sheet drops every cell on the renamed sheet,
    // so `Data!C2` reads "" instead of 11. `worker-runtime-ts.ts::
    // rebuildPreservingCells` snapshots surviving cells keyed by the sheet's
    // OLD name, then restores them by looking up the NEW name — the renamed
    // sheet's snapshot is never found and its cells are silently discarded.
    // add/remove/move keep names, which is why only rename is affected.
    // WASM keeps its cells, so the assertions below still guard that engine.
    test.fixme(test.info().project.name === 'ts', 'TS worker rename wipes the renamed sheet')

    await gotoWorkerDemo(page)

    await renameSheetViaTab(page, 'Sheet3', 'Data')
    await expect(tab(page, 'Data')).toBeVisible()
    await expect(tab(page, 'Sheet3')).toHaveCount(0)

    // The renamed sheet stays active; its own formula targets Sheet1 by
    // name, so it is unaffected by its host sheet's rename.
    await expect(tab(page, 'Data')).toHaveAttribute('data-active', 'true')
    await expect(cellDisplay(page, 'C2')).toHaveText('11')

    // Sheet2 still spells the OLD name in its formulas → #REF! (the AST
    // is not rewritten; the old name no longer resolves).
    await selectSheet(page, 'Sheet2')
    await expect(cellDisplay(page, 'C5')).toHaveText('#REF!')
    await expect(cellDisplay(page, 'C2')).toHaveText('#REF!')

    // Formula source text still shows the old name.
    await cell(page, 'C5').click()
    await expect(page.getByTestId('formula-bar-input')).toHaveValue('=Sheet3!B4+5')

    // Rename back — the same spelled references resolve again.
    await renameSheetViaTab(page, 'Data', 'Sheet3')
    await expect(tab(page, 'Sheet3')).toBeVisible()
    await selectSheet(page, 'Sheet2')
    await expect(cellDisplay(page, 'C5')).toHaveText('105')
    await expect(cellDisplay(page, 'C2')).toHaveText('12')
    await selectSheet(page, 'Sheet1')
    await expect(cellDisplay(page, 'C2')).toHaveText('13')
    await expectNoConsoleErrors(page)
  })

  test('renaming to a duplicate name is rejected with a visible error', async ({ page }) => {
    await gotoWorkerDemo(page)

    await tab(page, 'Sheet2').dblclick()
    const input = renameInput(page)
    await expect(input).toBeVisible()
    await input.fill('Sheet1')
    await input.press('Enter')

    // Backend rejects (SHEET_RENAME_FAILED) and the error surfaces in the
    // sheet-tabs alert region.
    await expect(page.getByTestId('sheet-tabs-error')).toBeVisible()

    // The rejected draft leaves the rename editor open — Escape cancels it
    // (guarded in case a future build auto-closes the editor on failure).
    if ((await input.count()) > 0) {
      await input.press('Escape')
    }
    await expect(tab(page, 'Sheet2')).toBeVisible()
    await expect(tab(page, 'Sheet1')).toHaveCount(1)
    await expect(sheetTabs(page).getByRole('tab')).toHaveCount(3)
  })

  test('deleting a referenced sheet surfaces #REF! after the next reprojection', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)

    await selectSheet(page, 'Sheet2')
    await expect(cellDisplay(page, 'C5')).toHaveText('105')

    // Right-click the (non-active) Sheet3 tab → Delete → confirm dialog.
    await tab(page, 'Sheet3').click({ button: 'right' })
    await page.getByTestId('sheet-tab-menu-delete').click()
    await expect(page.getByTestId('sheet-tab-delete-confirmation')).toBeVisible()
    await page.getByTestId('sheet-tab-delete-confirm').click()

    await expect(tab(page, 'Sheet3')).toHaveCount(0)
    await expect(sheetTabs(page).getByRole('tab')).toHaveCount(2)

    // Deleting a NON-active sheet keeps the current sheet active.
    await expect(tab(page, 'Sheet2')).toHaveAttribute('data-active', 'true')

    // Verified 2026-07-29: the still-open sheet keeps showing the stale
    // 105/12 until a reprojection is forced (see the fixme below / CASES.md
    // MS-19). A sheet switch round-trip repaints the direct references to
    // the deleted sheet as #REF!.
    await selectSheet(page, 'Sheet1')
    await selectSheet(page, 'Sheet2')
    await expect(cellDisplay(page, 'C5')).toHaveText('#REF!')
    await expect(cellDisplay(page, 'C2')).toHaveText('#REF!')
    await expectNoConsoleErrors(page)
  })

  // ⚠️ CASES.md MS-19: deleting a referenced sheet does NOT refresh the
  // visible sheet in place — Sheet2!C5 kept showing 105 (and C2 kept 12)
  // for seconds after the delete, until a sheet switch forced a new
  // visible-window read. The revision bump from deleteSheet should dirty
  // the dependents' projection like rename does (the rename path repaints
  // after a switch too, but delete leaves the CURRENT sheet stale with no
  // user hint at all). Product fix needed; do not work around in UI specs.
  test.fixme(
    'deleting a referenced sheet refreshes the visible sheet in place (currently stale)',
    async ({ page }) => {
      await gotoWorkerDemo(page)
      await selectSheet(page, 'Sheet2')
      await expect(cellDisplay(page, 'C5')).toHaveText('105')

      await tab(page, 'Sheet3').click({ button: 'right' })
      await page.getByTestId('sheet-tab-menu-delete').click()
      await page.getByTestId('sheet-tab-delete-confirm').click()
      await expect(tab(page, 'Sheet3')).toHaveCount(0)

      // No sheet switch — the in-place projection should repaint.
      await expect(cellDisplay(page, 'C5')).toHaveText('#REF!')
      await expect(cellDisplay(page, 'C2')).toHaveText('#REF!')
    },
  )
})
