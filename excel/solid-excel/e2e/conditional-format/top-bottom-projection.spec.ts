import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellInput,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
  typeIntoCell,
} from '../helpers'

async function gotoWorkerDemo(page: Page) {
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'C2')).toContainText('13', { timeout: 30_000 })
}

async function selectRange(page: Page) {
  await cell(page, 'B2').click()
  await cell(page, 'B6').click({ modifiers: ['Shift'] })
}

async function saveTopBottom(
  page: Page,
  direction: 'top' | 'bottom',
  count: string,
  background: string,
  percent = false,
) {
  await page.getByTestId('toolbar-btn-conditional-format').click()
  const dialog = page.getByTestId('vnext-worker-conditional-format')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('cf-rule-kind-select').selectOption('top-bottom')
  await dialog.getByTestId('cf-top-bottom-direction').selectOption(direction)
  await dialog.getByTestId('cf-top-bottom-count').fill(count)
  if (percent) await dialog.getByTestId('cf-top-bottom-percent').check()
  await dialog.getByTestId('cf-top-bottom-background').fill(background)
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

test.describe('Top/Bottom projection — real Worker backends', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('renders stable full-range Top and Bottom Percent through TS and WASM workers', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)
    expect(['ts', 'wasm']).toContain(test.info().project.name)

    for (const [address, value] of [
      ['B2', '100'],
      ['B3', '90'],
      ['B4', '90'],
      ['B5', '80'],
      ['B6', '10'],
    ] as const) {
      await typeIntoCell(page, address, value)
    }
    await selectRange(page)
    await saveTopBottom(page, 'top', '2', '#ef4444')
    await selectRange(page)
    await saveTopBottom(page, 'bottom', '60', '#3b82f6', true)

    for (const [address, color] of [
      ['B2', 'rgb(239, 68, 68)'],
      ['B3', 'rgb(239, 68, 68)'],
      ['B5', 'rgb(59, 130, 246)'],
      ['B6', 'rgb(59, 130, 246)'],
    ]) {
      await expect(cell(page, address)).toHaveAttribute('data-has-conditional-format', 'true')
      await expect(cell(page, address)).toHaveCSS('background-color', color)
    }
    // Equal 90s are cut by source coordinate: B3 wins Bottom's final slot but
    // keeps the earlier Top color; B4 is unmatched and adds no focusable overlay.
    await expect(cell(page, 'B4')).toHaveAttribute('data-has-conditional-format', 'false')
    await expect(cell(page, 'B4').locator('[tabindex]')).toHaveCount(0)

    await cell(page, 'B3').dblclick()
    await expect(cellInput(page, 'B3')).toBeVisible()
    await cellInput(page, 'B3').press('Escape')
    await expect(cell(page, 'B3')).toHaveCSS('background-color', 'rgb(239, 68, 68)')

    await scrollGrid(page, 3_000)
    await expect
      .poll(() =>
        page
          .getByTestId('vnext-worker-grid')
          .locator('.spreadsheet-grid-scroll-viewport')
          .evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(0)
    await expect(cell(page, 'B6')).toHaveCSS('background-color', 'rgb(59, 130, 246)')
    await scrollGrid(page, 0)

    await cell(page, 'B3').click({ button: 'right' })
    await page.getByTestId('context-menu-command-view.freezePanes').click()
    await expect(cell(page, 'B2')).toHaveAttribute('data-frozen-row', 'true')
    await expect(cell(page, 'B2')).toHaveCSS('background-color', 'rgb(239, 68, 68)')
  })
})
