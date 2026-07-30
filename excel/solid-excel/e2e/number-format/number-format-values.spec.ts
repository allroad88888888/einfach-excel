import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  guardConsoleErrors,
  typeIntoCell,
  withEnglishLocale,
} from '../helpers'

/**
 * Number-format value matrix — negative and zero inputs, thousands
 * grouping, and format-switch replacement semantics.
 *
 * The Wave 5 demo formats through the projection pipeline
 * (`spreadsheet-ui-core/src/operations/format/numberFormat.ts`):
 *  - Number        → 0.00        (two decimals, no grouping)
 *  - NumberThousands → #,##0.00  (two decimals, grouped)
 *  - Percent       → 0%          (zero decimals)
 *  - Currency      → "$"#,##0.00 (symbol literal precedes the sign)
 * Negative/zero/text *sections* of custom pattern strings have no UI
 * entry point yet — see CASES.md deferred rows.
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

/** Select `addr`, then apply a number-format dropdown row by its stable id. */
async function applyDropdownFormat(page: Page, addr: string, formatId: string) {
  await cell(page, addr).click()
  await page.getByTestId('toolbar-btn-number-format').click()
  const dropdown = page.getByTestId('number-format-dropdown')
  await expect(dropdown).toBeVisible()
  await page.getByTestId(`number-format-item-${formatId}`).click()
  await expect(dropdown).toBeHidden()
}

test.describe('Number format — negative, zero, and grouping values', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('Number format renders negative and zero with two decimals', async ({ page }) => {
    await gotoWave5(page)

    await typeIntoCell(page, 'B2', '-1234.5')
    await applyDropdownFormat(page, 'B2', 'Number')
    await expect(cellDisplay(page, 'B2')).toHaveText('-1234.50')

    await typeIntoCell(page, 'C2', '0')
    await applyDropdownFormat(page, 'C2', 'Number')
    await expect(cellDisplay(page, 'C2')).toHaveText('0.00')
  })

  test('thousands grouping keeps the minus sign on negatives', async ({ page }) => {
    await gotoWave5(page)

    await typeIntoCell(page, 'B2', '1234.5')
    await applyDropdownFormat(page, 'B2', 'NumberThousands')
    await expect(cellDisplay(page, 'B2')).toHaveText('1,234.50')

    await typeIntoCell(page, 'C2', '-1234.5')
    await applyDropdownFormat(page, 'C2', 'NumberThousands')
    await expect(cellDisplay(page, 'C2')).toHaveText('-1,234.50')
  })

  test('percent format renders zero and negative fractions', async ({ page }) => {
    await gotoWave5(page)

    await typeIntoCell(page, 'B2', '0')
    await applyDropdownFormat(page, 'B2', 'Percent')
    await expect(cellDisplay(page, 'B2')).toHaveText('0%')

    await typeIntoCell(page, 'C2', '-0.25')
    await applyDropdownFormat(page, 'C2', 'Percent')
    await expect(cellDisplay(page, 'C2')).toHaveText('-25%')
  })

  test('currency format renders zero and negatives with grouping', async ({ page }) => {
    await gotoWave5(page)

    await typeIntoCell(page, 'B2', '0')
    await applyDropdownFormat(page, 'B2', 'Currency')
    await expect(cellDisplay(page, 'B2')).toHaveText('$0.00')

    // The `$` literal precedes the sign in the generated pattern, so the
    // projection renders `$-1,234.50` (not `-$1,234.50`).
    await typeIntoCell(page, 'C2', '-1234.5')
    await applyDropdownFormat(page, 'C2', 'Currency')
    await expect(cellDisplay(page, 'C2')).toHaveText('$-1,234.50')
  })

  test('switching thousands to percent replaces the format wholesale', async ({ page }) => {
    await gotoWave5(page)

    await typeIntoCell(page, 'B2', '1234.5')
    await applyDropdownFormat(page, 'B2', 'NumberThousands')
    await expect(cellDisplay(page, 'B2')).toHaveText('1,234.50')

    // Percent (zero decimals, no grouping) must fully replace the
    // thousands format — no leftover group separators like "1,234,50%".
    await applyDropdownFormat(page, 'B2', 'Percent')
    await expect(cellDisplay(page, 'B2')).toHaveText('123450%')
  })
})
