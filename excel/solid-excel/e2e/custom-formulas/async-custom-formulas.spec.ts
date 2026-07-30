import { test, expect, type Page } from '@playwright/test'
import { cell, cellDisplay, cellInput, gotoRoot } from '../helpers'

/**
 * Wave 8.2 — async custom formulas (`isAsync: true`).
 *
 * The vNext Worker demo seeds `SLOWTAX` (VNextWorkerDemo.tsx): an async
 * callback that awaits ~800ms, then returns `args[0] * 0.2`. Engine
 * contract (excel/rust/excel-core/src/CUSTOM_FORMULAS.md § "Async custom
 * formulas"):
 *
 *  - while the Promise is in flight the cell holds `#BUSY!`, which
 *    propagates to dependents like any error;
 *  - the worker pump settles the value back into the engine and exactly
 *    the observing formulas re-derive;
 *  - settles are memoized per (name, args) until the next registry change;
 *  - `IFERROR` swallows the pending `#BUSY!` like any other error.
 *
 * The 800ms artificial delay is what makes the transient `#BUSY!` state
 * observable: assertions land well inside the window, and the memo test
 * can distinguish a cache hit (settles in worker-roundtrip time) from a
 * re-execution (settles no sooner than 800ms).
 */

async function gotoWorker(page: Page) {
  await gotoRoot(page)
  await page.getByTestId('nav-tab-vnext-worker').click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  // Seeded projection ready gate: Sheet1!C2 = 13.
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

async function typeIntoWorkerCell(page: Page, addr: string, value: string) {
  await cell(page, addr).dblclick()
  const input = cellInput(page, addr)
  await expect(input).toBeVisible()
  await input.fill(value)
  await input.press('Enter')
  await expect(input).toHaveCount(0)
}

test.describe('async custom formulas — #BUSY! lifecycle', () => {
  test('#BUSY! shows while pending, then settles and propagates to a dependent', async ({
    page,
  }) => {
    await gotoWorker(page)
    // Dependent first: B6 is empty so C6 evaluates immediately.
    await typeIntoWorkerCell(page, 'C6', '=B6*2')
    await expect(cellDisplay(page, 'C6')).toHaveText('0')

    // Committing the async formula returns #BUSY! synchronously; the
    // pump settles it ~800ms later. The transient must be user-visible.
    await typeIntoWorkerCell(page, 'B6', '=SLOWTAX(100)')
    await expect(cellDisplay(page, 'B6')).toHaveText('#BUSY!')

    // Settled: 100 * 0.2 = 20, and the dependent re-derives to 40.
    await expect(cellDisplay(page, 'B6')).toHaveText('20')
    await expect(cellDisplay(page, 'C6')).toHaveText('40')
  })

  test('same (name, args) re-entry is memoized — no second 800ms delay', async ({ page }) => {
    await gotoWorker(page)
    await typeIntoWorkerCell(page, 'B6', '=SLOWTAX(100)')
    await expect(cellDisplay(page, 'B6')).toHaveText('20')

    // Second call with identical args must hit the memo: it settles in
    // worker-roundtrip time. The 700ms budget sits under the 800ms
    // artificial delay, so a cache miss (re-execution) fails this
    // assertion by construction.
    await typeIntoWorkerCell(page, 'D6', '=SLOWTAX(100)')
    await expect(cellDisplay(page, 'D6')).toHaveText('20', { timeout: 700 })
  })

  test('IFERROR swallows the pending #BUSY! and re-derives on settle', async ({ page }) => {
    await gotoWorker(page)
    await typeIntoWorkerCell(page, 'C6', '=IFERROR(B6, "pending")')

    await typeIntoWorkerCell(page, 'B6', '=SLOWTAX(50)')
    // While B6 is #BUSY!, IFERROR falls through to its fallback branch.
    await expect(cellDisplay(page, 'C6')).toHaveText('pending')

    // Settled: 50 * 0.2 = 10 flows through IFERROR unchanged.
    await expect(cellDisplay(page, 'B6')).toHaveText('10')
    await expect(cellDisplay(page, 'C6')).toHaveText('10')
  })
})
