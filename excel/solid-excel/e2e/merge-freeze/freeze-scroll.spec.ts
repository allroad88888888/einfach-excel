import { expect, test, type Page } from '@playwright/test'
import { cell, cellDisplay, guardConsoleErrors, withEnglishLocale } from '../helpers'

/**
 * Freeze panes under real scrolling on the Wave 5 static demo
 * (CASES.md FZ-11/12/13).
 *
 * freeze-panes.spec.ts pins the menu entries and boundary markers at rest;
 * these cases scroll the grid and assert the geometry contract: frozen
 * rows/cols hold their viewport position (`position: sticky`), scrollable
 * quadrants move by exactly the scrolled offset, the cross quadrant is
 * pinned on both axes, and unfreeze hands the cells back to normal
 * scrolling.
 *
 * Freeze at C3 → frozen rows 1-2 (indices 0-1) and frozen cols A-B
 * (indices 0-1). Probe matrix: A1 = cross quadrant, B1/D1 = frozen row,
 * A6 = frozen col, D6 = fully scrollable.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'B2')).toHaveText('120')
}

async function freezeAtC3(page: Page) {
  await cell(page, 'C3').click({ button: 'right' })
  await page.getByTestId('context-menu-command-view.freezePanes').click()
  await expect(page.getByTestId('freeze-boundary')).toBeVisible()
}

/** Set one scroll axis and return the offset the browser actually applied. */
async function scrollTo(page: Page, axis: 'x' | 'y', px: number): Promise<number> {
  return page.locator('[data-testid="wave5-grid"] .spreadsheet-grid-scroll-viewport').evaluate(
    (el, args) => {
      if (args.axis === 'x') {
        el.scrollLeft = args.px
        return el.scrollLeft
      }
      el.scrollTop = args.px
      return el.scrollTop
    },
    { axis, px },
  )
}

async function cellY(page: Page, addr: string): Promise<number> {
  const box = await cell(page, addr).boundingBox()
  return box ? box.y : Number.NaN
}

async function cellX(page: Page, addr: string): Promise<number> {
  const box = await cell(page, addr).boundingBox()
  return box ? box.x : Number.NaN
}

test.describe('Wave 5 freeze panes under scroll', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('vertical scroll: frozen rows and the cross quadrant hold still, the rest moves', async ({
    page,
  }) => {
    await gotoWave5(page)
    await freezeAtC3(page)

    const crossY = await cellY(page, 'A1')
    const frozenRowY = await cellY(page, 'B1')
    const frozenColY = await cellY(page, 'A6')
    const movingY = await cellY(page, 'D6')

    const applied = await scrollTo(page, 'y', 96)
    expect(applied).toBe(96)

    // The scrollable quadrants move up by exactly the scrolled offset…
    await expect.poll(() => cellY(page, 'D6')).toBeLessThan(movingY - 90)
    expect(Math.abs((await cellY(page, 'D6')) - (movingY - applied))).toBeLessThanOrEqual(2)
    expect(Math.abs((await cellY(page, 'A6')) - (frozenColY - applied))).toBeLessThanOrEqual(2)

    // …while the frozen rows and the cross quadrant stay pinned.
    expect(Math.abs((await cellY(page, 'A1')) - crossY)).toBeLessThanOrEqual(2)
    expect(Math.abs((await cellY(page, 'B1')) - frozenRowY)).toBeLessThanOrEqual(2)

    // The pinned band still renders its own content, not a stale copy.
    await expect(cellDisplay(page, 'A1')).toHaveText('Region')
    await expect(cellDisplay(page, 'B1')).toHaveText('Q1')
    await expect(cell(page, 'B1')).toHaveAttribute('data-frozen-row', 'true')
  })

  test('horizontal scroll: frozen cols and the cross quadrant hold still, frozen-row cells move', async ({
    page,
  }) => {
    await gotoWave5(page)
    await freezeAtC3(page)

    const crossX = await cellX(page, 'A1')
    const frozenColX = await cellX(page, 'A6')
    const movingX = await cellX(page, 'D1')

    const applied = await scrollTo(page, 'x', 192)
    expect(applied).toBeGreaterThanOrEqual(96)

    // A frozen-row cell in a non-frozen column scrolls left with the sheet…
    await expect.poll(() => cellX(page, 'D1')).toBeLessThan(movingX - applied + 2)
    expect(Math.abs((await cellX(page, 'D1')) - (movingX - applied))).toBeLessThanOrEqual(2)

    // …while the frozen columns keep their x on every row.
    expect(Math.abs((await cellX(page, 'A1')) - crossX)).toBeLessThanOrEqual(2)
    expect(Math.abs((await cellX(page, 'A6')) - frozenColX)).toBeLessThanOrEqual(2)
    await expect(cell(page, 'A6')).toHaveAttribute('data-frozen-col', 'true')
    await expect(cellDisplay(page, 'A1')).toHaveText('Region')
  })

  test('unfreezing while scrolled clears every marker and restores normal scrolling', async ({
    page,
  }) => {
    await gotoWave5(page)
    const bootY = await cellY(page, 'A1')

    await freezeAtC3(page)
    const applied = await scrollTo(page, 'y', 96)
    expect(applied).toBe(96)

    // While frozen, A1 stays pinned at its boot position.
    await expect
      .poll(async () => Math.abs((await cellY(page, 'A1')) - bootY))
      .toBeLessThanOrEqual(2)

    // Unfreeze from the pinned cross quadrant.
    await cell(page, 'A1').click({ button: 'right' })
    await page.getByTestId('context-menu-command-view.unfreeze').click()
    await expect(page.getByTestId('freeze-boundary')).toHaveCount(0)
    await expect(page.locator('th.spreadsheet-grid-row-header[data-frozen-row]')).toHaveCount(0)
    await expect(page.locator('th.spreadsheet-grid-col-header[data-frozen-col]')).toHaveCount(0)
    await expect(page.locator('td.spreadsheet-grid-cell[data-frozen-row]')).toHaveCount(0)
    await expect(page.locator('td.spreadsheet-grid-cell[data-frozen-col]')).toHaveCount(0)

    // Scrolling back to the top restores the boot geometry — A1 is a plain
    // scrolling cell again, exactly where it started.
    await scrollTo(page, 'y', 0)
    await expect
      .poll(async () => Math.abs((await cellY(page, 'A1')) - bootY))
      .toBeLessThanOrEqual(2)
    await expect(cellDisplay(page, 'A1')).toHaveText('Region')
  })
})
