import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * SEL-02 / SEL-03 (CASES.md): Shift+Click range extension on the vNext
 * Wave 5 grid.
 *
 * The grid handles a plain Shift+Click in `onMouseDown` (SpreadsheetGrid
 * .tsx) and routes it to `selectCellAtom` with `extend: true`, so the
 * anchor stays put and the focus jumps to the clicked cell. A second
 * Shift+Click re-extends from the SAME anchor — the rectangle shrinks or
 * changes direction rather than growing cumulatively.
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
  // Wait for the seeded projection before interacting (B2 = 120 fixture).
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

test.describe('Selection — Shift+Click extension', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Shift+Click extends the selection from the active cell to a rectangle', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()
    await expect(cell(page, 'B2')).toHaveAttribute('data-active', 'true')

    await cell(page, 'D5').click({ modifiers: ['Shift'] })

    // Rectangle corners + an interior cell are selected.
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B5')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D5')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'C3')).toHaveAttribute('data-selected', 'true')

    // Focus (active cell) is the shift-clicked corner, anchor is not active.
    await expect(cell(page, 'D5')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'B2')).toHaveAttribute('data-active', 'false')

    // Just outside the rectangle stays unselected.
    await expect(cell(page, 'E5')).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'B6')).toHaveAttribute('data-selected', 'false')
  })

  test('a second Shift+Click re-extends from the original anchor (shrinks the range)', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()
    await cell(page, 'D5').click({ modifiers: ['Shift'] })
    await expect(cell(page, 'D5')).toHaveAttribute('data-selected', 'true')

    await cell(page, 'C3').click({ modifiers: ['Shift'] })

    // New rectangle is B2:C3 — anchored at B2, focused on C3.
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'C3')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'C3')).toHaveAttribute('data-active', 'true')

    // Cells only inside the old B2:D5 rectangle are no longer selected.
    await expect(cell(page, 'D5')).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'D3')).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'B4')).toHaveAttribute('data-selected', 'false')
  })

  test('plain click after a shift-extension collapses back to a single cell', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()
    await cell(page, 'D5').click({ modifiers: ['Shift'] })
    await expect(cell(page, 'C3')).toHaveAttribute('data-selected', 'true')

    await cell(page, 'E6').click()

    await expect(cell(page, 'E6')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'E6')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'C3')).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'D5')).toHaveAttribute('data-selected', 'false')
  })
})
