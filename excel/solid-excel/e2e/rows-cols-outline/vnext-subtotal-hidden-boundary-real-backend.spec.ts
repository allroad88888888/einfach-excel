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
 * SUBTOTAL hidden-row boundary cases on the vNext Worker WASM demo
 * (CASES.md RC-18/19). Extends vnext-subtotal-hidden-real-backend.spec.ts
 * (single hidden row, SUM pair only):
 *  - hiding EVERY data row drives SUBTOTAL 109 to 0 while SUBTOTAL 9 and a
 *    plain SUM keep the full total, and undo peels one hide at a time;
 *  - the AVERAGE pair (101 vs 1) re-averages over the visible rows only.
 *
 * WASM-only for the same reason as the base spec: the TS worker declares
 * `evalHiddenRows: false`, so `setEvalHiddenRows` is withheld on `ts` and
 * the 101-111 variants never exclude manually hidden rows there.
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
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

function rowHeader(page: Page, row: number) {
  return page.locator(`th.spreadsheet-grid-row-header[data-row="${row}"]`)
}

/** Hide one source row via the row-header context menu (data-row is 0-based). */
async function hideRow(page: Page, row: number) {
  await rowHeader(page, row).click({ button: 'right' })
  const hideItem = page.getByTestId('context-menu-command-row.hide')
  await expect(hideItem).toBeVisible()
  await hideItem.click()
  await expect(rowHeader(page, row)).toHaveCount(0)
}

test.describe('vNext SUBTOTAL hidden-row boundaries — real WASM backend', () => {
  test.beforeEach(() => {
    test.skip(
      !activeProjectIsWasm(),
      'SUBTOTAL 101-111 hidden exclusion is WASM-only (TS worker declares evalHiddenRows:false)',
    )
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('hiding every data row drives SUBTOTAL 109 to 0 and undo peels one hide at a time', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await typeIntoCell(page, 'F1', '10')
    await typeIntoCell(page, 'F2', '20')
    await typeIntoCell(page, 'F3', '30')
    await typeIntoCell(page, 'F5', '=SUBTOTAL(109,F1:F3)')
    await typeIntoCell(page, 'F6', '=SUBTOTAL(9,F1:F3)')
    await typeIntoCell(page, 'G5', '=SUM(F1:F3)')

    // Baseline: nothing hidden, all three probes read the full total.
    await expect(cellDisplay(page, 'F5')).toHaveText('60')
    await expect(cellDisplay(page, 'F6')).toHaveText('60')
    await expect(cellDisplay(page, 'G5')).toHaveText('60')

    // Hide the data rows one by one; 109 shrinks with each visible subset.
    await hideRow(page, 0)
    await expect(cellDisplay(page, 'F5')).toHaveText('50')
    await hideRow(page, 1)
    await expect(cellDisplay(page, 'F5')).toHaveText('30')
    await hideRow(page, 2)

    // Boundary: the visible subset is empty — 109 sums nothing. The 9
    // variant and the plain SUM never cared about manual hides.
    await expect(cell(page, 'F1')).toHaveCount(0)
    await expect(cellDisplay(page, 'F5')).toHaveText('0')
    await expect(cellDisplay(page, 'F6')).toHaveText('60')
    await expect(cellDisplay(page, 'G5')).toHaveText('60')

    // Undo peels the LAST hide only: the 30 row returns and 109 follows.
    await page.getByTestId('history-timeline-undo').click()
    await expect(cellDisplay(page, 'F3')).toHaveText('30')
    await expect(cellDisplay(page, 'F5')).toHaveText('30')
    await expect(cellDisplay(page, 'F6')).toHaveText('60')
  })

  test('the AVERAGE pair re-averages: SUBTOTAL 101 drops the hidden row, SUBTOTAL 1 keeps it', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    await typeIntoCell(page, 'F1', '10')
    await typeIntoCell(page, 'F2', '20')
    await typeIntoCell(page, 'F3', '30')
    await typeIntoCell(page, 'F5', '=SUBTOTAL(101,F1:F3)')
    await typeIntoCell(page, 'F6', '=SUBTOTAL(1,F1:F3)')

    await expect(cellDisplay(page, 'F5')).toHaveText('20')
    await expect(cellDisplay(page, 'F6')).toHaveText('20')

    // Hide the 30 row: 101 averages the visible {10, 20}, 1 keeps all three.
    await hideRow(page, 2)
    await expect(cellDisplay(page, 'F5')).toHaveText('15')
    await expect(cellDisplay(page, 'F6')).toHaveText('20')

    // Undo restores the full average.
    await page.getByTestId('history-timeline-undo').click()
    await expect(cellDisplay(page, 'F3')).toHaveText('30')
    await expect(cellDisplay(page, 'F5')).toHaveText('20')
  })
})
