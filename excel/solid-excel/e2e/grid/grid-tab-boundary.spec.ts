import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

const GRID_TEST_ID = 'wave5-grid'
const NAVIGATION_AFFORDANCE_SELECTOR = [
  '.spreadsheet-grid-scroll-viewport',
  '.spreadsheet-grid-col-resize-handle',
  '.spreadsheet-grid-row-resize-handle',
  '.spreadsheet-grid-filter-chevron',
  '.spreadsheet-grid-fill-handle',
  '.spreadsheet-outline-level-button',
  '.spreadsheet-outline-toggle',
].join(', ')

function cell(page: Page, address: string) {
  return page.getByTestId(GRID_TEST_ID).locator(`td.cell[data-cell-addr="${address}"]`)
}

async function gotoWave5(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page, 'locale=en')
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId(GRID_TEST_ID)).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

async function gotoVNextSmoke(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page, 'locale=en')
  await page.getByTestId('nav-tab-vnext').click()
  await expect(page.getByTestId('vnext-grid')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('vnext-grid').locator('.cell-rich-link')).toHaveText('Docs')
}

async function expectActiveCell(page: Page, address: string) {
  const activeCell = cell(page, address)
  await expect(activeCell).toHaveAttribute('data-active', 'true')
  const activeId = await activeCell.getAttribute('id')
  if (!activeId) throw new Error(`missing active descendant id for ${address}`)
  await expect(page.getByTestId(GRID_TEST_ID)).toHaveAttribute('aria-activedescendant', activeId)
}

test.describe('Wave 5 grid Tab boundary', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('keeps navigation affordances out of the navigation Tab sequence', async ({ page }) => {
    await gotoWave5(page)

    const grid = page.getByTestId(GRID_TEST_ID)
    const navigationAffordances = grid.locator(NAVIGATION_AFFORDANCE_SELECTOR)
    await expect(navigationAffordances).not.toHaveCount(0)
    const sequentialAffordances = await navigationAffordances.evaluateAll((elements) =>
      elements
        .filter(
          (element) =>
            !element.hasAttribute('disabled') &&
            element instanceof HTMLElement &&
            element.tabIndex >= 0,
        )
        .map((element) => ({
          tagName: element.tagName,
          testId: element.getAttribute('data-testid'),
          className: element.getAttribute('class'),
        })),
    )

    expect(sequentialAffordances).toEqual([])
  })

  test('keeps a rich hyperlink as an independent keyboard focus target', async ({ page }) => {
    await gotoVNextSmoke(page)

    const link = page.getByTestId('vnext-grid').locator('a.cell-rich-link')
    const selectedSheetTab = page
      .getByTestId('vnext-sheet-tabs')
      .locator('[role="tab"][aria-selected="true"]')
    await expect(link).toHaveAttribute('href', 'https://example.com/spreadsheet-docs')

    await selectedSheetTab.focus()
    await page.keyboard.press('Shift+Tab')

    await expect(link).toBeFocused()
  })

  test('moves internal Tab and Shift+Tab through atom-selected cells', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'B2').click()
    await expect(page.getByTestId(GRID_TEST_ID)).toBeFocused()
    await expectActiveCell(page, 'B2')

    await page.keyboard.press('Tab')
    await expect(page.getByTestId(GRID_TEST_ID)).toBeFocused()
    await expectActiveCell(page, 'C2')

    await page.keyboard.press('Shift+Tab')
    await expect(page.getByTestId(GRID_TEST_ID)).toBeFocused()
    await expectActiveCell(page, 'B2')
  })

  test('lets A1 Shift+Tab focus the previous native formula input', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'A1').click()
    await expectActiveCell(page, 'A1')

    await page.keyboard.press('Shift+Tab')

    await expect(page.getByTestId('formula-bar-input')).toBeFocused()
    await expectActiveCell(page, 'A1')
  })

  test('lets P50 Tab focus the next native sheet tab', async ({ page }) => {
    await gotoWave5(page)

    await cell(page, 'C5').click()
    await page.keyboard.press('ControlOrMeta+End')
    await expectActiveCell(page, 'P50')

    await page.keyboard.press('Tab')

    await expect(
      page.getByTestId('wave5-sheet-tabs').locator('[role="tab"][aria-selected="true"]'),
    ).toBeFocused()
    await expectActiveCell(page, 'P50')
  })
})
