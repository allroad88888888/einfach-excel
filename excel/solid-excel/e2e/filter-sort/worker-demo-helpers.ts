import { expect, test, type Page } from '@playwright/test'

import { cell, cellDisplay, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * Folder-local helpers for the filter-sort specs that drive the vNext Worker
 * demo. Mirrors the spec-local helpers the migrated specs carry inline; new
 * specs share them from here instead of re-pasting (plan §5: new shared
 * helpers stay inside the feature folder, never in the root helpers.ts).
 */

export function activeProjectIsWasm(): boolean {
  try {
    return test.info().project.name !== 'ts'
  } catch {
    return true
  }
}

export async function gotoWorkerDemo(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page, 'locale=en')
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

export function workerFilterDropdown(page: Page) {
  return page.getByTestId('vnext-worker-filter-dropdown')
}

/**
 * Click a vnext-grid cell and wait for it to become the active cell. The
 * shared `selectCell` helper waits for the legacy grid's `.cell-selected`
 * class; the vnext grid marks the active cell with `data-active="true"`.
 */
export async function selectGridCell(page: Page, addr: string) {
  await cell(page, addr).click()
  await expect(cell(page, addr)).toHaveAttribute('data-active', 'true')
}

export function sortHistoryEntry(page: Page) {
  return page.locator('.history-timeline-entry[data-kind="range.sort"]')
}

/**
 * Open the filter dropdown on `col` (0-based) via the toolbar button and
 * uncheck a single value in the value list, then OK. OK applies AND closes
 * the dropdown (Excel parity), so the helper returns with the dropdown gone.
 */
export async function uncheckValueFilter(page: Page, col: number, value: string) {
  await page.locator(`th.spreadsheet-grid-col-header[data-col="${col}"]`).click()
  const filterButton = page.getByTestId('toolbar-btn-filter')
  await expect(filterButton).toBeEnabled()
  await filterButton.click()
  await expect(workerFilterDropdown(page)).toBeVisible()
  await page.getByTestId(`filter-value-${value}`).uncheck()
  await page.getByTestId('filter-add-equals').click()
  await expect(workerFilterDropdown(page)).toBeHidden()
}

/**
 * Clear the active filter through the column chevron (the dropdown is closed
 * after OK, so the chevron is the reopen affordance) and close the dropdown.
 */
export async function clearFilterViaChevron(page: Page, col: number) {
  await page.getByTestId(`filter-chevron-${col}`).click()
  await expect(workerFilterDropdown(page)).toBeVisible()
  await page.getByTestId('filter-clear-filter').click()
  await page.getByTestId('filter-close').click()
  await expect(workerFilterDropdown(page)).toBeHidden()
}
