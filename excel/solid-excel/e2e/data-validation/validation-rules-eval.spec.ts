import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
  typeIntoCell,
} from '../helpers'

/**
 * DV-05..DV-07 (CASES.md): per-cell validation evaluation on the vNext
 * Worker demo (real worker backend, wasm + ts runtimes share the
 * adapter-level `applyValidationOverlay`).
 *
 * Semantics pinned AS IMPLEMENTED:
 * - Every cell inside a rule range carries the rule marker
 *   `data-validation-code="validation.<kind>"` (blank cells included).
 * - An invalid committed value flips the code to the outcome code
 *   (`validation.range_out_of_bounds`, `validation.list_mismatch`, …);
 *   a valid value restores the generic marker. Severity always comes
 *   from the rule mode: reject → error, warn → warning.
 * - "Reject" does NOT block the commit — the value lands and the cell
 *   is flagged. Clearing the rule removes the attributes entirely.
 */

async function gotoWorkerDemo(page: Page) {
  await gotoRoot(page, 'locale=en')
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

function dialog(page: Page) {
  return page.getByTestId('vnext-worker-data-validation')
}

async function openDialogForSelection(page: Page) {
  await page.getByTestId('toolbar-btn-data-validation').click()
  await expect(dialog(page)).toBeVisible()
}

test.describe('Data validation — worker-backend rule evaluation', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('range rule (reject): invalid value is flagged, valid value restores the marker', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)

    await cell(page, 'D2').click()
    await openDialogForSelection(page)

    await dialog(page).getByTestId('validation-kind-select').selectOption('range')
    await dialog(page).getByTestId('validation-range-min').fill('1')
    await dialog(page).getByTestId('validation-range-max').fill('100')
    await dialog(page).getByTestId('validation-mode-select').selectOption('reject')
    await dialog(page).getByTestId('validation-save-button').click()
    await expect(dialog(page)).toBeHidden()

    // Blank cell inside the rule range carries the generic rule marker.
    await expect(cell(page, 'D2')).toHaveAttribute('data-validation-code', 'validation.range')
    await expect(cell(page, 'D2')).toHaveAttribute('data-validation-severity', 'error')

    // Out-of-bounds commit lands (reject does not block) but is flagged.
    await typeIntoCell(page, 'D2', '500')
    await expect(cellDisplay(page, 'D2')).toHaveText('500')
    await expect(cell(page, 'D2')).toHaveAttribute(
      'data-validation-code',
      'validation.range_out_of_bounds',
    )
    await expect(cell(page, 'D2')).toHaveAttribute('data-validation-severity', 'error')

    // A value inside the bounds restores the generic marker.
    await typeIntoCell(page, 'D2', '50')
    await expect(cellDisplay(page, 'D2')).toHaveText('50')
    await expect(cell(page, 'D2')).toHaveAttribute('data-validation-code', 'validation.range')
  })

  test('list rule (warn) applied to E2:F3 stamps all four cells and evaluates edits', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)

    await cell(page, 'E2').click()
    await cell(page, 'F3').click({ modifiers: ['Shift'] })
    await openDialogForSelection(page)

    await dialog(page).getByTestId('validation-kind-select').selectOption('list')
    await dialog(page).getByTestId('validation-list-values').fill('Yes,No')
    await dialog(page).getByTestId('validation-mode-select').selectOption('warn')
    await dialog(page).getByTestId('validation-save-button').click()
    await expect(dialog(page)).toBeHidden()

    // Every cell of the range carries the rule marker with warn severity.
    for (const addr of ['E2', 'F2', 'E3', 'F3']) {
      await expect(cell(page, addr)).toHaveAttribute('data-validation-code', 'validation.list')
      await expect(cell(page, addr)).toHaveAttribute('data-validation-severity', 'warning')
    }
    // A cell just outside the range is untouched.
    await expect(cell(page, 'G2')).not.toHaveAttribute('data-validation-code', /.+/)

    // A value outside the list is flagged with the mismatch code but the
    // severity stays the rule's warn level.
    await typeIntoCell(page, 'E2', 'Maybe')
    await expect(cell(page, 'E2')).toHaveAttribute(
      'data-validation-code',
      'validation.list_mismatch',
    )
    await expect(cell(page, 'E2')).toHaveAttribute('data-validation-severity', 'warning')

    // A listed value restores the generic marker.
    await typeIntoCell(page, 'E2', 'Yes')
    await expect(cell(page, 'E2')).toHaveAttribute('data-validation-code', 'validation.list')
  })

  test('clearing the rule removes validation marks from the whole range', async ({ page }) => {
    await gotoWorkerDemo(page)

    // Install a list rule over E2:F3 first.
    await cell(page, 'E2').click()
    await cell(page, 'F3').click({ modifiers: ['Shift'] })
    await openDialogForSelection(page)
    await dialog(page).getByTestId('validation-kind-select').selectOption('list')
    await dialog(page).getByTestId('validation-list-values').fill('Yes,No')
    await dialog(page).getByTestId('validation-save-button').click()
    await expect(dialog(page)).toBeHidden()
    await expect(cell(page, 'E2')).toHaveAttribute('data-validation-code', 'validation.list')

    // Re-open on the same selection and clear.
    await cell(page, 'E2').click()
    await cell(page, 'F3').click({ modifiers: ['Shift'] })
    await openDialogForSelection(page)
    await dialog(page).getByTestId('validation-clear-button').click()
    await expect(dialog(page)).toBeHidden()

    for (const addr of ['E2', 'F2', 'E3', 'F3']) {
      await expect(cell(page, addr)).not.toHaveAttribute('data-validation-code', /.+/)
    }

    // Free input works with no flag afterwards.
    await typeIntoCell(page, 'E2', 'anything goes')
    await expect(cellDisplay(page, 'E2')).toHaveText('anything goes')
    await expect(cell(page, 'E2')).not.toHaveAttribute('data-validation-code', /.+/)
  })
})
