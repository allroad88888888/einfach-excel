import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellInput,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
  typeIntoCell,
} from '../helpers'

function bar(page: Page, address: string) {
  return cell(page, address).locator('.spreadsheet-grid-data-bar')
}

async function gotoWorkerDemo(page: Page) {
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'C2')).toContainText('13', { timeout: 30_000 })
}

async function saveDataBar(page: Page) {
  await page.getByTestId('toolbar-btn-conditional-format').click()
  const dialog = page.getByTestId('vnext-worker-conditional-format')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('cf-rule-kind-select').selectOption('data-bar')
  await dialog.getByTestId('cf-data-bar-min-color').fill('#eff6ff')
  await dialog.getByTestId('cf-data-bar-max-color').fill('#1d4ed8')
  await dialog.getByTestId('cf-save-button').click()
  await expect(dialog).toBeHidden()
}

async function scrollGrid(page: Page, top: number) {
  await page
    .getByTestId('vnext-worker-grid')
    .locator('.spreadsheet-grid-scroll-viewport')
    .evaluate((element, scrollTop) => {
      element.scrollTop = scrollTop
    }, top)
}

test.describe('Data Bar projection — real Worker backends', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('renders full-domain ratios as decorative bars through TS and WASM workers', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    expect(['ts', 'wasm']).toContain(test.info().project.name)

    await typeIntoCell(page, 'B2', '-100')
    await typeIntoCell(page, 'B3', '0')
    await typeIntoCell(page, 'B4', '100')
    await cell(page, 'B2').click()
    await cell(page, 'B4').click({ modifiers: ['Shift'] })
    await saveDataBar(page)

    for (const [address, ratio] of [
      ['B2', '0'],
      ['B3', '0.5'],
      ['B4', '1'],
    ]) {
      await expect(cell(page, address)).toHaveAttribute('data-has-data-bar', 'true')
      await expect(cell(page, address)).toHaveAttribute('data-has-conditional-format', 'false')
      await expect(bar(page, address)).toHaveAttribute('data-ratio', ratio)
    }

    const middle = bar(page, 'B3')
    await expect(middle).toHaveAttribute('aria-hidden', 'true')
    await expect(middle).not.toHaveAttribute('tabindex')
    await expect(middle).toHaveCSS('pointer-events', 'none')

    // Editing removes only the decoration, leaving the normal editor unobstructed.
    await cell(page, 'B3').dblclick()
    await expect(cellInput(page, 'B3')).toBeVisible()
    await expect(middle).toHaveCount(0)
    await cellInput(page, 'B3').press('Escape')
    await expect(middle).toHaveAttribute('data-ratio', '0.5')

    // The Worker demo's 20-row sheet fits in its anchored five-viewport
    // surface, so this verifies the actual scroll update without asserting an
    // unmount that its intentionally small fixture cannot produce.
    await scrollGrid(page, 3_000)
    await expect
      .poll(() =>
        page
          .getByTestId('vnext-worker-grid')
          .locator('.spreadsheet-grid-scroll-viewport')
          .evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(0)
    await expect(bar(page, 'B4')).toHaveAttribute('data-ratio', '1')
    await scrollGrid(page, 0)
    await expect(bar(page, 'B4')).toHaveAttribute('data-ratio', '1')

    // B2 is in the frozen row band when freezing above B3; the bar follows the cell.
    await cell(page, 'B3').click({ button: 'right' })
    await page.getByTestId('context-menu-command-view.freezePanes').click()
    await expect(cell(page, 'B2')).toHaveAttribute('data-frozen-row', 'true')
    await expect(bar(page, 'B2')).toHaveAttribute('data-ratio', '0')
  })
})
