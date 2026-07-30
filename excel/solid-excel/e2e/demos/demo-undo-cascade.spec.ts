import { test, expect, type Page } from '@playwright/test'
import {
  cellDisplay,
  expectDisplay,
  expectNoConsoleErrors,
  gotoDemo,
  guardConsoleErrors,
  typeIntoCell,
} from '../helpers'

/**
 * Undo / redo across a real formula cascade in each app demo.
 *
 * The history suite pins undo mechanics on the Blank (JS mock) demo only;
 * these tests prove one Ctrl/Cmd+Z after an edit that fanned out through a
 * WASM-evaluated dependency graph rolls the WHOLE visible graph back (and
 * one redo replays it) — not just the edited source cell. Seed addresses
 * and values come from `DemoBudget.tsx` / `DemoGrades.tsx` /
 * `DemoSales.tsx`; if a seed changes, this spec follows.
 */

const META = process.platform === 'darwin' ? 'Meta' : 'Control'

async function pressUndo(page: Page) {
  await page.locator('.excel-table-wrapper').focus()
  await page.keyboard.press(`${META}+z`)
}

async function pressRedo(page: Page) {
  await page.locator('.excel-table-wrapper').focus()
  await page.keyboard.press(`${META}+Shift+z`)
}

test.describe('Demo undo/redo cascade', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Budget: undo of the C8 edit rolls back diff, totals and stats in one step', async ({
    page,
  }) => {
    guardConsoleErrors(page)
    await gotoDemo(page, 'Budget')

    // Baseline sanity for every cell the cascade will touch.
    await expectDisplay(page, 'D8', '0')
    await expectDisplay(page, 'C14', '7000')
    await expectDisplay(page, 'C16', '3500')
    await expectDisplay(page, 'G2', '2500')

    // Rent actual 2500 → 3000 fans out to diff, totals, net, MAX and AVG.
    await typeIntoCell(page, 'C8', '3000')
    await expectDisplay(page, 'D8', '500')
    await expectDisplay(page, 'C14', '7500')
    await expectDisplay(page, 'C16', '3000')
    await expectDisplay(page, 'G2', '3000')
    await expectDisplay(page, 'G4', '1250')

    // ONE undo restores the source cell and every dependent.
    await pressUndo(page)
    await expectDisplay(page, 'C8', '2500')
    await expectDisplay(page, 'D8', '0')
    await expectDisplay(page, 'C14', '7000')
    await expectDisplay(page, 'C16', '3500')
    await expectDisplay(page, 'G2', '2500')
    // G4 = 7000/6 = 1166.66… — prefix-match for formatter drift.
    expect((await cellDisplay(page, 'G4').textContent()) ?? '').toMatch(/^1166\.6/)

    // ONE redo replays the full cascade.
    await pressRedo(page)
    await expectDisplay(page, 'C8', '3000')
    await expectDisplay(page, 'C14', '7500')
    await expectDisplay(page, 'G4', '1250')
  })

  test('Grades: undo of the B7 edit restores row stats and class stats together', async ({
    page,
  }) => {
    guardConsoleErrors(page)
    await gotoDemo(page, 'Grade Calc')

    await expectDisplay(page, 'F7', '52')
    await expectDisplay(page, 'B11', '79.125')
    await expectDisplay(page, 'B13', '45')

    // Frank's math 45 → 90 lifts him out of bottom-Math.
    await typeIntoCell(page, 'B7', '90')
    await expectDisplay(page, 'F7', '90')
    await expectDisplay(page, 'B11', '84.75')
    await expectDisplay(page, 'B13', '63')

    await pressUndo(page)
    await expectDisplay(page, 'B7', '45')
    await expectDisplay(page, 'F7', '52')
    await expectDisplay(page, 'B11', '79.125')
    await expectDisplay(page, 'B13', '45')

    await pressRedo(page)
    await expectDisplay(page, 'B11', '84.75')
    await expectDisplay(page, 'B13', '63')
  })

  test('Sales: undo of the B4 edit flips the growth-rate KPI sign back', async ({ page }) => {
    guardConsoleErrors(page)
    await gotoDemo(page, 'Sales Dashboard')

    await expectDisplay(page, 'E4', '25700')
    await expectDisplay(page, 'E8', '93200')
    expect((await cellDisplay(page, 'H9').textContent()) ?? '').toMatch(/^20\.6/)

    // January Product A 12000 → 20000: totals shift and H9 goes negative.
    await typeIntoCell(page, 'B4', '20000')
    await expectDisplay(page, 'E4', '33700')
    await expectDisplay(page, 'E8', '101200')
    await expectDisplay(page, 'H4', '101200')
    expect((await cellDisplay(page, 'H9').textContent()) ?? '').toMatch(/^-8\./)

    // Undo must restore the totals AND flip H9 back to positive growth —
    // pins that dependents recompute on undo instead of latching.
    await pressUndo(page)
    await expectDisplay(page, 'B4', '12000')
    await expectDisplay(page, 'E4', '25700')
    await expectDisplay(page, 'E8', '93200')
    await expectDisplay(page, 'H4', '93200')
    expect((await cellDisplay(page, 'H9').textContent()) ?? '').toMatch(/^20\.6/)

    await pressRedo(page)
    await expectDisplay(page, 'E4', '33700')
    expect((await cellDisplay(page, 'H9').textContent()) ?? '').toMatch(/^-8\./)
  })
})
