import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  guardConsoleErrors,
  withEnglishLocale,
} from '../helpers'

/**
 * Clear Format — toolbar state restoration.
 *
 * `toolbar-clear-format.spec.ts` already covers the CSS restore (bold /
 * fill / text color revert on the cell). This spec covers the OTHER half
 * of the promise: after clearing, the toolbar itself must read as
 * pristine again — every toggle's `aria-pressed` drops to false, the
 * percent indicator releases, the displayed value returns to General,
 * and the eraser button disables itself.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

const clearFormatBtn = (page: Page) => page.getByTestId('toolbar-btn-clear-format')
const boldBtn = (page: Page) => page.getByTestId('toolbar-btn-bold')
const italicBtn = (page: Page) => page.getByTestId('toolbar-btn-italic')
const wrapBtn = (page: Page) => page.getByTestId('toolbar-btn-wrap')
const percentBtn = (page: Page) => page.getByTestId('toolbar-btn-percent-format')

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

test.describe('Toolbar — clear format restores toolbar state', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('clearing resets pressed toggles, percent indicator, and value display', async ({
    page,
  }) => {
    await gotoWave5(page)
    // B2 holds the numeric seed 120 — a good target for the percent check.
    await cell(page, 'B2').click()
    await expect(cellDisplay(page, 'B2')).toHaveText('120')

    await boldBtn(page).click()
    await italicBtn(page).click()
    await wrapBtn(page).click()
    await percentBtn(page).click()

    await expect(boldBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(italicBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(wrapBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(percentBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(cellDisplay(page, 'B2')).toHaveText('12000%')
    await expect(clearFormatBtn(page)).toBeEnabled()

    await clearFormatBtn(page).click()

    // Value falls back to General rendering and every toggle releases.
    await expect(cellDisplay(page, 'B2')).toHaveText('120')
    await expect(boldBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(italicBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(wrapBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(percentBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(clearFormatBtn(page)).toBeDisabled()
    await expectNoConsoleErrors(page)
  })

  test('clearing a mixed multi-cell range restores every cell and the button states', async ({
    page,
  }) => {
    await gotoWave5(page)

    // Build a mixed range: B3 bold, C3 italic.
    await cell(page, 'B3').click()
    await boldBtn(page).click()
    await expect(cellDisplay(page, 'B3')).toHaveCSS('font-weight', '700')
    await cell(page, 'C3').click()
    await italicBtn(page).click()
    await expect(cellDisplay(page, 'C3')).toHaveCSS('font-style', 'italic')

    // Drag B3→C3: the active cell is the drag endpoint C3 (italic), which
    // carries format — the eraser must be enabled and clear the whole
    // selection, not just the active cell.
    await dragSelect(page, 'B3', 'C3')
    await expect(clearFormatBtn(page)).toBeEnabled()
    await clearFormatBtn(page).click()

    await expect(cellDisplay(page, 'B3')).not.toHaveCSS('font-weight', '700')
    await expect(cellDisplay(page, 'C3')).not.toHaveCSS('font-style', 'italic')
    await expect(boldBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(italicBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(clearFormatBtn(page)).toBeDisabled()

    // The italic cell must also read clean when it becomes the active cell.
    await cell(page, 'C3').click()
    await expect(italicBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(clearFormatBtn(page)).toBeDisabled()
    await expectNoConsoleErrors(page)
  })
})
