import { expect, test, type Page } from '@playwright/test'
import { cell, cellDisplay, guardConsoleErrors, withEnglishLocale } from '../helpers'

/**
 * Mixed-format selection — what the toolbar toggle buttons show (and do)
 * when the selected range mixes formatted and unformatted cells.
 *
 * Contract (SpreadsheetToolbar.tsx::activeCellFormat + core
 * selection/index.ts::getActiveCell):
 *  - `aria-pressed` reflects the ACTIVE cell only, never an aggregate of
 *    the range. The active cell of a range selection is its FOCUS — the
 *    drag endpoint — not the drag anchor (this diverges from Excel's
 *    anchor convention; it is the core's documented "focused cell" model).
 *  - Clicking a toggle computes the next value from the active cell's
 *    current state and applies it to EVERY cell in the selection. So a
 *    mixed range converges: plain focus → all bold; bold focus → all plain.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

function boldButton(page: Page) {
  return page.getByTestId('toolbar-btn-bold')
}

/** Drag-select from `fromAddr` to `toAddr`. The drag endpoint becomes the active cell. */
async function dragSelect(page: Page, fromAddr: string, toAddr: string) {
  const start = cell(page, fromAddr)
  const end = cell(page, toAddr)
  const sb = await start.boundingBox()
  const eb = await end.boundingBox()
  if (!sb || !eb) throw new Error('cells not visible')
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
  await page.mouse.down()
  await page.mouse.move(eb.x + eb.width / 2, eb.y + eb.height / 2, { steps: 4 })
  await page.mouse.up()
  for (const addr of [fromAddr, toAddr]) {
    await expect(cell(page, addr)).toHaveAttribute('data-selected', 'true')
  }
}

/** Make exactly one cell bold via the toolbar, then verify it took. */
async function makeBold(page: Page, addr: string) {
  await cell(page, addr).click()
  await boldButton(page).click()
  await expect(cellDisplay(page, addr)).toHaveCSS('font-weight', '700')
}

test.describe('Toolbar — mixed-format selection', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('bold pressed-state follows the focus cell of a mixed selection', async ({ page }) => {
    await gotoWave5(page)
    await makeBold(page, 'B2')
    await expect(boldButton(page)).toHaveAttribute('aria-pressed', 'true')

    // Single plain cell → not pressed.
    await cell(page, 'C2').click()
    await expect(boldButton(page)).toHaveAttribute('aria-pressed', 'false')

    // Mixed range whose drag ENDS on the bold cell → pressed, even though
    // the range contains a plain cell.
    await dragSelect(page, 'C2', 'B2')
    await expect(boldButton(page)).toHaveAttribute('aria-pressed', 'true')

    // Same range dragged the other way (focus lands on the plain cell) →
    // not pressed.
    await dragSelect(page, 'B2', 'C2')
    await expect(boldButton(page)).toHaveAttribute('aria-pressed', 'false')
  })

  test('clicking bold on a mixed selection with a plain focus cell bolds every cell', async ({
    page,
  }) => {
    await gotoWave5(page)
    await makeBold(page, 'B2')
    await expect(cellDisplay(page, 'C2')).not.toHaveCSS('font-weight', '700')

    // Focus on the plain cell C2 — button reads "off", so one click must
    // converge the whole range to bold.
    await dragSelect(page, 'B2', 'C2')
    await expect(boldButton(page)).toHaveAttribute('aria-pressed', 'false')

    await boldButton(page).click()
    await expect(cellDisplay(page, 'B2')).toHaveCSS('font-weight', '700')
    await expect(cellDisplay(page, 'C2')).toHaveCSS('font-weight', '700')
    await expect(boldButton(page)).toHaveAttribute('aria-pressed', 'true')
  })

  test('clicking bold on a mixed selection with a bold focus cell unbolds every cell', async ({
    page,
  }) => {
    await gotoWave5(page)
    await makeBold(page, 'B2')

    // Focus on the bold cell B2 — button reads "on", so one click must
    // clear bold across the whole range (including the already-plain C2).
    await dragSelect(page, 'C2', 'B2')
    await expect(boldButton(page)).toHaveAttribute('aria-pressed', 'true')

    await boldButton(page).click()
    await expect(cellDisplay(page, 'B2')).not.toHaveCSS('font-weight', '700')
    await expect(cellDisplay(page, 'C2')).not.toHaveCSS('font-weight', '700')
    await expect(boldButton(page)).toHaveAttribute('aria-pressed', 'false')
  })
})
