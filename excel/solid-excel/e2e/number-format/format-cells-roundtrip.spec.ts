import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  guardConsoleErrors,
  typeIntoCell,
  withEnglishLocale,
} from '../helpers'

/**
 * Number-format round trips through the Format Cells dialog.
 *
 * Wave 5 routes the number-format dropdown's 自定义格式 (Custom) row to the
 * full Format Cells dialog seeded from the active cell's format. These
 * tests pin the round-trip promise: what the user applied (via dialog OR
 * dropdown) must be what the dialog shows when reopened, and a Save
 * without edits must not silently rewrite the stored format (e.g. clobber
 * percent digits back to a category default).
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
}

// The wave5 demo mounts the dialog with an overridden testid.
const dialog = (page: Page) => page.getByTestId('wave5-format-cells')

/** Open the Format Cells dialog on the Number tab via dropdown → Custom. */
async function openDialogViaCustomRow(page: Page) {
  await page.getByTestId('toolbar-btn-number-format').click()
  const dropdown = page.getByTestId('number-format-dropdown')
  await expect(dropdown).toBeVisible()
  await page.getByTestId('number-format-item-Custom').click()
  await expect(dropdown).toBeHidden()
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByTestId('format-cells-tab-number')).toHaveAttribute(
    'aria-selected',
    'true',
  )
}

async function saveDialog(page: Page) {
  await page.getByTestId('format-cells-save').click()
  await expect(dialog(page)).toBeHidden()
}

async function cancelDialog(page: Page) {
  await page.getByTestId('format-cells-cancel').click()
  await expect(dialog(page)).toBeHidden()
}

test.describe('Number format — Format Cells dialog round trip', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test('currency picked in the dialog survives save and reopens intact', async ({ page }) => {
    await gotoWave5(page)
    await cell(page, 'B2').click()
    await expect(cellDisplay(page, 'B2')).toHaveText('120')

    await openDialogViaCustomRow(page)
    // Unformatted cell seeds the General category.
    await expect(page.getByTestId('format-cells-category-general')).toBeChecked()

    await page.getByTestId('format-cells-category-currency').check()
    const symbol = page.getByTestId('format-cells-currency-symbol')
    await expect(symbol).toBeVisible()
    await expect(symbol).toHaveValue('$')
    await saveDialog(page)
    await expect(cellDisplay(page, 'B2')).toHaveText('$120.00')

    // Reopen — the dialog must reflect the stored format, not reset.
    await openDialogViaCustomRow(page)
    await expect(page.getByTestId('format-cells-category-currency')).toBeChecked()
    await expect(page.getByTestId('format-cells-currency-symbol')).toHaveValue('$')
    await cancelDialog(page)
    await expect(cellDisplay(page, 'B2')).toHaveText('$120.00')
    await expectNoConsoleErrors(page)
  })

  test('date pattern edited in the dialog round-trips through reopen', async ({ page }) => {
    await gotoWave5(page)
    await typeIntoCell(page, 'B2', '45432')
    await cell(page, 'B2').click()
    await expect(cellDisplay(page, 'B2')).toHaveText('45432')

    await openDialogViaCustomRow(page)
    await page.getByTestId('format-cells-category-date').check()
    const pattern = page.getByTestId('format-cells-date-pattern')
    await expect(pattern).toHaveValue('yyyy-MM-dd')
    await pattern.fill('yyyy/MM/dd')
    await saveDialog(page)
    // Excel serial 45432 = 2024-05-20; the edited pattern uses slashes.
    await expect(cellDisplay(page, 'B2')).toHaveText('2024/05/20')

    await openDialogViaCustomRow(page)
    await expect(page.getByTestId('format-cells-category-date')).toBeChecked()
    await expect(page.getByTestId('format-cells-date-pattern')).toHaveValue('yyyy/MM/dd')
    await cancelDialog(page)
    await expect(cellDisplay(page, 'B2')).toHaveText('2024/05/20')
  })

  test('decimal digits edited in the number category round-trip', async ({ page }) => {
    await gotoWave5(page)
    await typeIntoCell(page, 'B2', '1234.5')
    await cell(page, 'B2').click()

    await openDialogViaCustomRow(page)
    await page.getByTestId('format-cells-category-number').check()
    const decimals = page.getByTestId('format-cells-number-decimals')
    await expect(decimals).toHaveValue('2')
    await decimals.fill('3')
    await saveDialog(page)
    await expect(cellDisplay(page, 'B2')).toHaveText('1234.500')

    await openDialogViaCustomRow(page)
    await expect(page.getByTestId('format-cells-category-number')).toBeChecked()
    await expect(page.getByTestId('format-cells-number-decimals')).toHaveValue('3')
    await cancelDialog(page)
    await expect(cellDisplay(page, 'B2')).toHaveText('1234.500')
  })

  test('percent applied from the dropdown reopens as percentage and Save keeps digits', async ({
    page,
  }) => {
    await gotoWave5(page)
    await cell(page, 'B2').click()
    await expect(cellDisplay(page, 'B2')).toHaveText('120')

    await page.getByTestId('toolbar-btn-number-format').click()
    await page.getByTestId('number-format-item-Percent').click()
    // Dropdown Percent uses zero decimals: 120 → 12000%.
    await expect(cellDisplay(page, 'B2')).toHaveText('12000%')

    await openDialogViaCustomRow(page)
    await expect(page.getByTestId('format-cells-category-percentage')).toBeChecked()

    // Save with NO edits — the stored zero-digit percent must survive.
    // A regression here typically renders "12000.00%" (category default
    // of 2 digits clobbering the draft seed).
    await saveDialog(page)
    await expect(cellDisplay(page, 'B2')).toHaveText('12000%')
    await expectNoConsoleErrors(page)
  })
})
