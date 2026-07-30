import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * NAV-06 … NAV-11 (CASES.md): Home / End / Ctrl+Home / Ctrl+End and
 * PageUp / PageDown paging on the vNext Wave 5 grid.
 *
 * Bounds are the Wave 5 demo viewport constants: 50 rows x 16 cols
 * (A1 … P50), page height = floor(240px / 24px) = 10 rows — the paging
 * delta comes from `props.viewport`, not from measured browser size, so
 * the row math here is deterministic (see SpreadsheetGrid.tsx pageRows).
 * Ctrl+End targets the BOUNDS corner (P50), not the last populated cell —
 * that locator lives in Go To Special (go-to.spec.ts "last cell").
 * Alt+PageUp/PageDown horizontal paging and Ctrl+PageUp/PageDown sheet
 * switching are pinned by smoke/vnext-smoke.spec.ts — not repeated here.
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

async function expectActive(page: Page, addr: string) {
  // Home/End/Page targets can sit outside the rendered window; the
  // dispatched `viewport.scrollToCell` intent scrolls them into DOM first,
  // so allow a scroll-and-rerender beat before the attribute lands.
  await expect(cell(page, addr)).toHaveAttribute('data-active', 'true', { timeout: 10_000 })
}

test.describe('Keyboard navigation — Home / End', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Home collapses to column A of the current row', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'C5').click()
    await page.keyboard.press('Home')

    await expectActive(page, 'A5')
    await expect(cell(page, 'C5')).toHaveAttribute('data-selected', 'false')
  })

  test('Ctrl/Cmd+Home jumps to A1', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'C5').click()
    await page.keyboard.press('ControlOrMeta+Home')

    await expectActive(page, 'A1')
    await expect(cell(page, 'C5')).toHaveAttribute('data-selected', 'false')
  })

  test('End jumps to the last column of the current row and scrolls it into view', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'C5').click()
    await page.keyboard.press('End')

    await expectActive(page, 'P5')
  })

  test('Ctrl/Cmd+End jumps to the bounds corner P50', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'C5').click()
    await page.keyboard.press('ControlOrMeta+End')

    await expectActive(page, 'P50')
  })
})

test.describe('Keyboard navigation — PageUp / PageDown', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('PageDown advances by the visible row window and clamps at the last row', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'A1').click()

    await page.keyboard.press('PageDown')
    await expectActive(page, 'A11')

    await page.keyboard.press('PageDown')
    await expectActive(page, 'A21')

    // Three more pages: rows 31, 41, then clamp at the 50-row bound.
    await page.keyboard.press('PageDown')
    await page.keyboard.press('PageDown')
    await page.keyboard.press('PageDown')
    await expectActive(page, 'A50')

    // Already at the bottom — a further page is a no-op.
    await page.keyboard.press('PageDown')
    await expectActive(page, 'A50')
  })

  test('PageUp moves back by the window and clamps at row 1', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'A1').click()
    await page.keyboard.press('PageDown')
    await page.keyboard.press('PageDown')
    await expectActive(page, 'A21')

    await page.keyboard.press('PageUp')
    await expectActive(page, 'A11')

    await page.keyboard.press('PageUp')
    await expectActive(page, 'A1')

    // Clamped at the top — a further page keeps A1.
    await page.keyboard.press('PageUp')
    await expectActive(page, 'A1')
  })
})
