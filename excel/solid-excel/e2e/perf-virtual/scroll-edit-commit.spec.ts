import { test, expect, type Page } from '@playwright/test'
import { cell, cellDisplay, cellInput, gotoDemo, scrollWrapper } from '../helpers'

/**
 * Edit-session anchoring under mid-edit scroll — the commit must land at
 * the cell address where editing began, never at the screen position the
 * viewport slid to while the editor was open.
 *
 * Scroll deltas stay small enough that the editing cell remains mounted
 * via overscan (deep-scroll unmount semantics are undefined → CASES.md
 * PV-28, deferred). The Enter press is guarded: if a build commits on
 * scroll instead, the input is already gone and the value assertion below
 * still pins the landing address.
 *
 * Seed layout (DemoMillion): B2/B4/D2 are unseeded (their flat addresses
 * are not multiples of 500), so a displaced commit would be visible as a
 * non-empty displaced cell.
 */

async function gotoMillion(page: Page) {
  await gotoDemo(page, '1M Cells', 'debug=1')
  await expect(cell(page, 'A1')).toBeVisible({ timeout: 30_000 })
}

async function commitIfStillEditing(page: Page, addr: string) {
  const input = cellInput(page, addr)
  if ((await input.count()) > 0) {
    await input.press('Enter')
  }
  await expect(input).toHaveCount(0)
}

test.describe('Mid-edit scroll — commit lands at the anchored cell', () => {
  test('vertical scroll during edit: value lands in B2, not the displaced row', async ({
    page,
  }) => {
    await gotoMillion(page)

    await cell(page, 'B2').dblclick()
    const input = cellInput(page, 'B2')
    await expect(input).toBeVisible()
    await input.fill('123')

    // Two rows down — B2 slides toward the top edge but stays mounted.
    await scrollWrapper(page, 'y', 52)
    await commitIfStillEditing(page, 'B2')

    await scrollWrapper(page, 'y', 0)
    await expect(cellDisplay(page, 'B2')).toHaveText('123')
    // B4 now occupies B2's former screen slot — it must stay empty.
    await expect(cellDisplay(page, 'B4')).toHaveText('')
  })

  test('horizontal scroll during edit: value lands in B2, not the displaced column', async ({
    page,
  }) => {
    await gotoMillion(page)

    await cell(page, 'B2').dblclick()
    const input = cellInput(page, 'B2')
    await expect(input).toBeVisible()
    await input.fill('456')

    // Two columns right — B2 slides toward the left edge but stays mounted.
    await scrollWrapper(page, 'x', 200)
    await commitIfStillEditing(page, 'B2')

    await scrollWrapper(page, 'x', 0)
    await expect(cellDisplay(page, 'B2')).toHaveText('456')
    // D2 now occupies B2's former screen slot — it must stay empty.
    await expect(cellDisplay(page, 'D2')).toHaveText('')
  })
})
