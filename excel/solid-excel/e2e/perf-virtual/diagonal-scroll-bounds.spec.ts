import { test, expect, type Page } from '@playwright/test'
import { cell, expectDisplay, gotoDemo } from '../helpers'

/**
 * Combined-axis (diagonal) deep viewport travel on the 1M Cells demo.
 *
 * observability.spec.ts checks each axis separately; virtualize.spec.ts /
 * million-demo.spec.ts check per-axis subscription churn. This spec pins
 * the COMBINED case: a viewport parked deep on x AND y at once must keep
 * both the DOM cell count and the active subscription set viewport-shaped,
 * and the seeded far-corner anchor must hydrate at the diagonal position.
 *
 * Travel goes through `__einfachStore.setSelectionAnchor` (the viewport
 * follows the selection). Raw wrapper scrolls that leave the selected cell
 * behind are reverted by the keep-selection-in-view behavior (verified
 * 2026-07-29) — see CASES.md PV-30. Probes (`activeSubscriptionCount`,
 * `?debug=1`) are allowed here: perf-virtual is the one folder with
 * internal debug probes.
 */

async function anchorTo(page: Page, row: number, col: number) {
  await page.evaluate(
    (coord) => {
      const win = window as unknown as {
        __einfachStore?: { setSelectionAnchor: (c: { row: number; col: number }) => void }
      }
      win.__einfachStore?.setSelectionAnchor(coord)
    },
    { row, col },
  )
}

test.describe('Diagonal deep viewport — DOM and subscriptions stay bounded', () => {
  test('far-corner round trip keeps cell DOM and subscriptions viewport-shaped', async ({
    page,
  }) => {
    await gotoDemo(page, '1M Cells', 'debug=1')
    await expect(cell(page, 'A1')).toBeVisible({ timeout: 30_000 })

    const countCells = () => page.locator('table.excel-table tbody td.cell').count()
    const probe = () => page.evaluate(() => window.__einfachStore?.activeSubscriptionCount() ?? -1)

    const initialSubscriptions = await probe()
    expect(initialSubscriptions).toBeGreaterThan(0)

    // Deep diagonal: the seeded corner anchor AAA500 (row 499 / col 702).
    await anchorTo(page, 499, 702)
    await expect(cell(page, 'AAA500')).toBeVisible()
    await expectDisplay(page, 'AAA500', 'You scrolled to AAA500')
    await expect(cell(page, 'A1')).toHaveCount(0)

    const atCorner = await countCells()
    expect(atCorner).toBeGreaterThan(0)
    expect(atCorner).toBeLessThan(2200)

    // Round trip home — the corner window unmounts, A1 re-hydrates.
    await anchorTo(page, 0, 0)
    await expect(cell(page, 'A1')).toBeVisible()
    await expect(cell(page, 'AAA500')).toHaveCount(0)

    const atHome = await countCells()
    expect(atHome).toBeGreaterThan(0)
    expect(atHome).toBeLessThan(2200)

    // Load-bearing: the active set tracks the live viewport, not the
    // cumulative diagonal distance (~500 rows × ~700 cols visited).
    const finalSubscriptions = await probe()
    expect(finalSubscriptions - initialSubscriptions).toBeLessThan(200)
  })
})
