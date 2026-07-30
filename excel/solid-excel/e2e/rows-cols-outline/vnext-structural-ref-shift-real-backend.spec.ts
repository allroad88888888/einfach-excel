import { expect, test, type Page } from '@playwright/test'

import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
  typeIntoCell,
} from '../helpers'

/**
 * Structural edits shift formula references end to end on the vNext Worker
 * WASM demo (CASES.md RC-13/14/15): insert/delete rows and insert columns
 * through the header context menus, then read the REWRITTEN formula source
 * back through the formula bar and the recalculated value from the cell.
 * The reference rewrite (including the #REF! sentinel on delete) lives in
 * excel/rust/excel-core/src/shift.rs.
 *
 * WASM-only: the TS worker declares `structuralEdits: false` (fail-closed),
 * so the insert/delete context-menu commands never render on the `ts`
 * project — same gate as vnext-filter-structural-shift-real-backend.spec.ts.
 */

function activeProjectIsWasm(): boolean {
  try {
    return test.info().project.name !== 'ts'
  } catch {
    return true
  }
}

async function gotoWorkerDemo(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  // Seeded cross-sheet formula: proves the worker finished seeding.
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

function rowHeader(page: Page, row: number) {
  return page.locator(`th.spreadsheet-grid-row-header[data-row="${row}"]`)
}

function colHeader(page: Page, col: number) {
  return page.locator(`th.spreadsheet-grid-col-header[data-col="${col}"]`)
}

function formulaBar(page: Page) {
  return page.getByTestId('formula-bar-input')
}

test.describe('vNext structural edits shift formula references — real WASM backend', () => {
  test.beforeEach(() => {
    test.skip(
      !activeProjectIsWasm(),
      'structural edits are WASM-only (the TS worker declares structuralEdits:false)',
    )
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('inserting a row above the referenced band rewrites the formula source and keeps the value', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await typeIntoCell(page, 'F1', '10')
    await typeIntoCell(page, 'F2', '20')
    await typeIntoCell(page, 'F5', '=F1+F2')
    await expect(cellDisplay(page, 'F5')).toHaveText('30')

    // Insert one row above row 2 (data-row is 0-based).
    await rowHeader(page, 1).click({ button: 'right' })
    const insertItem = page.getByTestId('context-menu-command-row.insert')
    await expect(insertItem).toBeVisible()
    await insertItem.click()

    // The 20 moved down to F3, the formula cell moved to F6, and the engine
    // rewrote the shifted reference (F2 → F3) while F1 stayed put. The
    // rewritten source is the engine's canonical re-print, which
    // parenthesizes the expression (see shift.rs print fixtures).
    await expect(cellDisplay(page, 'F3')).toHaveText('20')
    await expect(cellDisplay(page, 'F6')).toHaveText('30')
    await expect(cellDisplay(page, 'F1')).toHaveText('10')
    await cell(page, 'F6').click()
    await expect(formulaBar(page)).toHaveValue('=(F1+F3)')
  })

  test('deleting a referenced row poisons only the dead reference with #REF! and undo restores it', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await typeIntoCell(page, 'F1', '5')
    await typeIntoCell(page, 'F2', '7')
    await typeIntoCell(page, 'F4', '=F1+F2')
    await expect(cellDisplay(page, 'F4')).toHaveText('12')

    // Delete row 2 — the row the second operand points at.
    await rowHeader(page, 1).click({ button: 'right' })
    const deleteItem = page.getByTestId('context-menu-command-row.delete')
    await expect(deleteItem).toBeVisible()
    await deleteItem.click()

    // The formula cell moved up to F3; the reference to the deleted row is
    // now the #REF! sentinel in the SOURCE, and the value errors out. The
    // intact F1 reference is untouched.
    await expect(cellDisplay(page, 'F3')).toHaveText(/^#REF/)
    await expect(cellDisplay(page, 'F1')).toHaveText('5')
    await cell(page, 'F3').click()
    await expect(formulaBar(page)).toHaveValue(/#REF!/)

    // Undo replays the recorded images: formula, references, and value return.
    await page.getByTestId('history-timeline-undo').click()
    await expect(cellDisplay(page, 'F4')).toHaveText('12')
    await expect(cellDisplay(page, 'F2')).toHaveText('7')
    await cell(page, 'F4').click()
    await expect(formulaBar(page)).toHaveValue('=F1+F2')
  })

  test('inserting a column shifts a cross-column reference right and rewrites its source', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await typeIntoCell(page, 'F1', '10')
    await typeIntoCell(page, 'D1', '=F1*2')
    await expect(cellDisplay(page, 'D1')).toHaveText('20')

    // Insert one column before F (data-col 5). D stays left of the insertion
    // point, so the formula cell does not move — only its reference does.
    await colHeader(page, 5).click({ button: 'right' })
    const insertItem = page.getByTestId('context-menu-command-column.insert')
    await expect(insertItem).toBeVisible()
    await insertItem.click()

    await expect(cellDisplay(page, 'G1')).toHaveText('10')
    await expect(cellDisplay(page, 'D1')).toHaveText('20')
    await cell(page, 'D1').click()
    // Canonical engine re-print, parenthesized (same as the row cases).
    await expect(formulaBar(page)).toHaveValue('=(G1*2)')
  })
})
