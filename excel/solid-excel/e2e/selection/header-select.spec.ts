import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

/**
 * SEL-06 … SEL-13 (CASES.md): whole-row / whole-column / select-all on the
 * vNext Wave 5 grid.
 *
 * Header cells carry `data-selected` only for `row` / `column` / `all`
 * selection KINDS (SpreadsheetGrid.tsx `isRowSelected` / `isColumnSelected`
 * / `isAllSelected`) — a plain cell range covering a full row does NOT
 * light the header, so these assertions pin the axis-selection semantics
 * specifically. Indices are 0-based: `data-row="2"` is visual row 3,
 * `data-col="1"` is column B.
 */

const GRID = '[data-testid="wave5-grid"]'

function cell(page: Page, addr: string) {
  return page.locator(`${GRID} td.cell[data-cell-addr="${addr}"]`)
}

function rowHeader(page: Page, rowIndex: number) {
  return page.locator(`${GRID} th.spreadsheet-grid-row-header[data-row="${rowIndex}"]`)
}

function colHeader(page: Page, colIndex: number) {
  return page.locator(`${GRID} th.spreadsheet-grid-col-header[data-col="${colIndex}"]`)
}

function corner(page: Page) {
  return page.locator(`${GRID} th.spreadsheet-grid-corner`)
}

async function gotoWave5(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page, 'locale=en')
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

test.describe('Selection — row header', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('clicking a row header selects the entire row', async ({ page }) => {
    await gotoWave5(page)

    await rowHeader(page, 2).click()

    await expect(rowHeader(page, 2)).toHaveAttribute('data-selected', 'true')
    // Cells across the row are selected; the active cell is column A.
    await expect(cell(page, 'A3')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D3')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'A3')).toHaveAttribute('data-active', 'true')
    // Adjacent rows stay out.
    await expect(rowHeader(page, 1)).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'D2')).toHaveAttribute('data-selected', 'false')
  })

  test('Shift+Click extends a contiguous row band from the anchor row', async ({ page }) => {
    await gotoWave5(page)

    await rowHeader(page, 1).click()
    await rowHeader(page, 3).click({ modifiers: ['Shift'] })

    for (const row of [1, 2, 3]) {
      await expect(rowHeader(page, row)).toHaveAttribute('data-selected', 'true')
    }
    await expect(cell(page, 'C2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'C4')).toHaveAttribute('data-selected', 'true')
    await expect(rowHeader(page, 4)).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'C5')).toHaveAttribute('data-selected', 'false')
  })

  test('Ctrl/Cmd+Click appends a disjoint row region', async ({ page }) => {
    await gotoWave5(page)

    await rowHeader(page, 0).click()
    await rowHeader(page, 4).click({ modifiers: ['ControlOrMeta'] })

    await expect(rowHeader(page, 0)).toHaveAttribute('data-selected', 'true')
    await expect(rowHeader(page, 4)).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B1')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B5')).toHaveAttribute('data-selected', 'true')
    // The gap rows are untouched.
    await expect(rowHeader(page, 2)).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'B3')).toHaveAttribute('data-selected', 'false')
  })
})

test.describe('Selection — column header', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('clicking a column header selects the entire column', async ({ page }) => {
    await gotoWave5(page)

    await colHeader(page, 1).click()

    await expect(colHeader(page, 1)).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B1')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B8')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B1')).toHaveAttribute('data-active', 'true')
    await expect(colHeader(page, 2)).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'C8')).toHaveAttribute('data-selected', 'false')
  })

  test('Shift+Click extends a contiguous column band from the anchor column', async ({
    page,
  }) => {
    await gotoWave5(page)

    await colHeader(page, 1).click()
    await colHeader(page, 3).click({ modifiers: ['Shift'] })

    for (const col of [1, 2, 3]) {
      await expect(colHeader(page, col)).toHaveAttribute('data-selected', 'true')
    }
    await expect(cell(page, 'B4')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D4')).toHaveAttribute('data-selected', 'true')
    await expect(colHeader(page, 4)).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'E4')).toHaveAttribute('data-selected', 'false')
  })

  test('row and column regions mix under Ctrl/Cmd+Click append', async ({ page }) => {
    await gotoWave5(page)

    await rowHeader(page, 1).click()
    await colHeader(page, 3).click({ modifiers: ['ControlOrMeta'] })

    // Both axis regions are alive at once.
    await expect(rowHeader(page, 1)).toHaveAttribute('data-selected', 'true')
    await expect(colHeader(page, 3)).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B2')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D6')).toHaveAttribute('data-selected', 'true')
    // Off both axes: unselected.
    await expect(cell(page, 'B4')).toHaveAttribute('data-selected', 'false')
  })
})

test.describe('Selection — select all', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('clicking the corner cell selects the whole sheet', async ({ page }) => {
    await gotoWave5(page)

    await corner(page).click()

    await expect(corner(page)).toHaveAttribute('data-selected', 'true')
    await expect(rowHeader(page, 0)).toHaveAttribute('data-selected', 'true')
    await expect(colHeader(page, 0)).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'A1')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'E7')).toHaveAttribute('data-selected', 'true')
  })

  test('Ctrl/Cmd+A selects all and a plain click collapses back to one cell', async ({
    page,
  }) => {
    await gotoWave5(page)

    await cell(page, 'B3').click()
    await page.keyboard.press('ControlOrMeta+a')

    await expect(corner(page)).toHaveAttribute('data-selected', 'true')
    await expect(rowHeader(page, 3)).toHaveAttribute('data-selected', 'true')
    await expect(colHeader(page, 2)).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'D6')).toHaveAttribute('data-selected', 'true')

    await cell(page, 'D4').click()

    await expect(corner(page)).toHaveAttribute('data-selected', 'false')
    await expect(cell(page, 'D4')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'D4')).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 'B3')).toHaveAttribute('data-selected', 'false')
    await expect(rowHeader(page, 3)).toHaveAttribute('data-selected', 'false')
  })
})
