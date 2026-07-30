import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import {
  expectNoConsoleErrors,
  grantClipboard,
  guardConsoleErrors,
  withEnglishLocale,
} from '../helpers'

/**
 * Paste-target semantics on the vNext Wave 5 static demo (50 rows × 16
 * cols, A..P). Two behaviors pinned AS IMPLEMENTED:
 *
 * 1. No tiling: `pasteFromClipboard` anchors ONE copy of the payload at
 *    `selection.activeCell` — which is the selection's FOCUS cell
 *    (`getActiveCell` in spreadsheet-ui-core/src/selection). Selecting a
 *    larger target rectangle does not repeat-fill it, and a shift-click
 *    extended selection pastes at the shift-clicked focus corner (Excel
 *    would keep the anchor corner active instead).
 *
 * 2. Overflow at the grid edge: the paste plan's `estimatedRange` is not
 *    clamped and the static backend's `importCells` has no bounds check —
 *    out-of-grid cells are stored but never rendered (the viewport caps at
 *    50×16). Visible product behavior: the in-bounds slice lands normally,
 *    the overflow is silently invisible, and nothing errors.
 */

const WAVE5_GRID = '[data-testid="wave5-grid"]'

function cell(page: Page, addr: string) {
  return page.locator(`${WAVE5_GRID} td.cell[data-cell-addr="${addr}"]`)
}

function display(page: Page, addr: string) {
  return cell(page, addr).locator('.cell-display')
}

async function gotoWave5(page: Page, context: BrowserContext) {
  await grantClipboard(context)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(display(page, 'B2')).toHaveText('120')
}

async function navigateViaNameBox(page: Page, addr: string) {
  const input = page.getByTestId('name-box-input')
  await input.click()
  await input.fill(addr)
  await input.press('Enter')
  await expect(cell(page, addr)).toBeVisible()
}

async function pressClipboardKey(page: Page, key: 'c' | 'v') {
  const meta = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${meta}+${key}`)
}

/** Copy the seed rectangle B2:C3 = [[120, 180], [80, 160]]. */
async function copySeed2x2(page: Page) {
  await cell(page, 'B2').click()
  await cell(page, 'C3').click({ modifiers: ['Shift'] })
  await pressClipboardKey(page, 'c')
}

test.describe('paste target — anchor semantics and grid-edge overflow', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('pasting into a larger multi-cell selection lands once at the anchor — no tiling', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)

    // Copy a single cell (B2 = 120).
    await cell(page, 'B2').click()
    await pressClipboardKey(page, 'c')

    // Select the 2×2 target J1:K2 — the shift-clicked K2 becomes the FOCUS
    // cell, and the product's active cell IS the focus cell. The window
    // scrolled to J renders up to column K, so the whole target is in-DOM.
    await navigateViaNameBox(page, 'J1')
    await cell(page, 'J1').click()
    await cell(page, 'K2').click({ modifiers: ['Shift'] })
    await expect(cell(page, 'J1')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'K2')).toHaveAttribute('data-selected', 'true')

    await pressClipboardKey(page, 'v')

    // One copy lands at the focus cell K2; the rest of the selected
    // rectangle stays empty — no Excel-style repeat tiling.
    await expect(display(page, 'K2')).toHaveText('120')
    await expect(display(page, 'J1')).toHaveText('')
    await expect(display(page, 'K1')).toHaveText('')
    await expect(display(page, 'J2')).toHaveText('')
  })

  test('paste overflowing the last column keeps only the in-bounds slice', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)

    await copySeed2x2(page)

    // P is the last column (colCount 16). Pasting a 2-wide payload at P2
    // targets P2:Q3 — Q does not exist in the grid.
    await navigateViaNameBox(page, 'P2')
    await cell(page, 'P2').click()
    await pressClipboardKey(page, 'v')

    // In-bounds column P receives both rows of the source's first column.
    await expect(display(page, 'P2')).toHaveText('120')
    await expect(display(page, 'P3')).toHaveText('80')
    // The overflow column is never rendered — no Q cells appear.
    await expect(cell(page, 'Q2')).toHaveCount(0)
    await expect(cell(page, 'Q3')).toHaveCount(0)
  })

  test('paste overflowing the last row keeps the in-bounds rows only', async ({
    page,
    context,
  }) => {
    await gotoWave5(page, context)

    await copySeed2x2(page)

    // Row 50 is the last row (rowCount 50). Pasting a 2-tall payload at C50
    // targets C50:D51 — row 51 does not exist in the grid.
    await navigateViaNameBox(page, 'C50')
    await cell(page, 'C50').click()
    await pressClipboardKey(page, 'v')

    await expect(display(page, 'C50')).toHaveText('120')
    await expect(display(page, 'D50')).toHaveText('180')
    await expect(cell(page, 'C51')).toHaveCount(0)
    await expect(cell(page, 'D51')).toHaveCount(0)
  })
})
