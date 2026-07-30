import { test, expect, type Page } from '@playwright/test'
import { cell, expectDisplay, gotoDemo, selectCell, typeIntoCell } from '../helpers'

/**
 * Far-viewport editing — the 1M Cells demo (1000×1000, col width 100px,
 * row height 26px). Column AAA is 0-based col 702; the A-column home
 * viewport is fully unmounted while it is in view.
 *
 * million-demo.spec.ts covers subscriptions/copy/paste at scale; these
 * specs pin the direct user-visible editing story at the virtualization
 * boundary: values, selection, and formula recomputation must survive
 * the unmount → remount cycle of both the source and the dependent cell.
 *
 * Navigation goes through `__einfachStore.setSelectionAnchor` (?debug=1),
 * which scrolls the viewport to the selection. Raw wrapper scrolls that
 * push the selected cell out of view are reverted by the demo's
 * keep-selection-in-view behavior (verified 2026-07-29; same trait the
 * million-demo paste spec routes around) — see CASES.md PV-30.
 * Assertions stay on product-visible cell text / classes.
 */

const FAR_COL = 702 // col AAA (0-based)

async function gotoMillion(page: Page) {
  await gotoDemo(page, '1M Cells', 'debug=1')
  await expect(cell(page, 'A1')).toBeVisible({ timeout: 30_000 })
}

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

test.describe('Far-viewport editing (1M Cells)', () => {
  test('far-column edit survives a viewport round-trip and re-selects', async ({ page }) => {
    await gotoMillion(page)

    await anchorTo(page, 0, FAR_COL)
    await expect(cell(page, 'AAA1')).toBeVisible()
    await typeIntoCell(page, 'AAA1', '21')
    await expectDisplay(page, 'AAA1', '21')
    await selectCell(page, 'AAA1')

    // Home trip: the far column unmounts entirely.
    await anchorTo(page, 0, 0)
    await expect(cell(page, 'A1')).toBeVisible()
    await expect(cell(page, 'AAA1')).toHaveCount(0)

    // Back out: the committed value re-hydrates and the selection marker
    // lands on the re-mounted cell.
    await anchorTo(page, 0, FAR_COL)
    await expect(cell(page, 'AAA1')).toBeVisible()
    await expectDisplay(page, 'AAA1', '21')
    await expect(cell(page, 'AAA1')).toHaveClass(/cell-selected/)
  })

  test('home-viewport formula reads a far column and recomputes on far edits', async ({ page }) => {
    await gotoMillion(page)

    await anchorTo(page, 1, FAR_COL)
    await expect(cell(page, 'AAA2')).toBeVisible()
    await typeIntoCell(page, 'AAA2', '21')

    await anchorTo(page, 0, 1)
    await expect(cell(page, 'B1')).toBeVisible()
    await typeIntoCell(page, 'B1', '=AAA2*2')
    await expectDisplay(page, 'B1', '42')

    // Edit the far source again — the dependent in the home viewport
    // recomputes even though both cells were unmounted in between.
    await anchorTo(page, 1, FAR_COL)
    await expect(cell(page, 'AAA2')).toBeVisible()
    await typeIntoCell(page, 'AAA2', '30')

    await anchorTo(page, 0, 1)
    await expect(cell(page, 'B1')).toBeVisible()
    await expectDisplay(page, 'B1', '60')
  })

  test('diagonal far-corner edit persists across a home round-trip', async ({ page }) => {
    await gotoMillion(page)

    // AAB500 = row 499 / col 703 — next to the seeded AAA500 anchor.
    await anchorTo(page, 499, FAR_COL + 1)
    await expect(cell(page, 'AAB500')).toBeVisible()
    await expectDisplay(page, 'AAA500', 'You scrolled to AAA500')
    await typeIntoCell(page, 'AAB500', '7')

    await anchorTo(page, 0, 0)
    await expect(cell(page, 'A1')).toBeVisible()
    await expectDisplay(page, 'A1', '1')
    await expect(cell(page, 'AAB500')).toHaveCount(0)

    await anchorTo(page, 499, FAR_COL + 1)
    await expect(cell(page, 'AAB500')).toBeVisible()
    await expectDisplay(page, 'AAB500', '7')
  })
})
