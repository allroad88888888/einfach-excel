import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * SEL-04 / SEL-05 (CASES.md): multi-range composition on the vNext Wave 5
 * grid. Complements the real-backend cell-level Ctrl+Click evidence in
 * vnext-selection-real-backend.spec.ts with:
 *
 *   - Ctrl/Cmd+Shift+Click → `appendRangeSelection` (a whole rectangle is
 *     APPENDED as a new region, anchored at the current active cell)
 *   - Escape with >1 region → `selection.clearNonPrimary` keyboard intent
 *     (only the primary region survives)
 *
 * `ControlOrMeta` resolves to Meta on darwin — plain Ctrl+Click would open
 * the macOS context menu (same reason the real-backend spec branches on
 * process.platform).
 */

const GRID = '[data-testid="wave5-grid"]'

function cell(page: Page, addr: string) {
  return page.locator(`${GRID} td.cell[data-cell-addr="${addr}"]`)
}

async function gotoWave5(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page, 'locale=en')
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

test.describe('Selection — multi-range append', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Ctrl/Cmd+Shift+Click appends a rectangle anchored at the active cell', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()
    await expect(cell(page, 'B2')).toHaveAttribute('data-active', 'true')

    await cell(page, 'D4').click({ modifiers: ['ControlOrMeta', 'Shift'] })

    // The appended region spans B2:D4 — corners and interior selected.
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B4')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D4')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'C3')).toHaveAttribute('data-selected', 'true')

    // Outside the appended rectangle stays unselected.
    await expect(cell(page, 'E4')).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'B5')).toHaveAttribute('data-selected', 'false')
  })

  test('appended rectangle coexists with a disjoint cell region', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()
    // Disjoint single-cell region far from the upcoming rectangle.
    await cell(page, 'F8').click({ modifiers: ['ControlOrMeta'] })
    await expect(cell(page, 'F8')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'true')

    // Rectangle anchored at the new active cell (F8) up-left to D6.
    await cell(page, 'D6').click({ modifiers: ['ControlOrMeta', 'Shift'] })

    await expect(cell(page, 'D6')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'E7')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'F8')).toHaveAttribute('data-selected', 'true')
    // The first region is still alive.
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'true')
    // Between the two regions nothing is selected.
    await expect(cell(page, 'C4')).toHaveAttribute('data-selected', 'false')
  })

  test('Escape collapses a multi-region selection down to the primary region', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'B4').click()
    await cell(page, 'D2').click({ modifiers: ['ControlOrMeta'] })

    // Two regions: B4 + D2, with the appended D2 as the primary/active one.
    await expect(cell(page, 'B4')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D2')).toHaveAttribute('data-active', 'true')

    await page.keyboard.press('Escape')

    // Only the primary region survives the clear-non-primary intent.
    await expect(cell(page, 'D2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D2')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'B4')).toHaveAttribute('data-selected', 'false')
  })
})
