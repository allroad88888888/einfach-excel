import { test, expect, type Page } from '@playwright/test'
import { cell, cellDisplay, cellInput, gotoRoot } from '../helpers'

/**
 * Custom formulas — 2-D range-arg marshaling beyond the Nx1 column the
 * legacy MED #6 regression covers (custom-formulas.spec.ts).
 *
 * Contract (excel/rust/excel-core/src/CUSTOM_FORMULAS.md § "Marshaling",
 * mirrored in spreadsheet-ui-core/src/custom-formulas/README.md): a range
 * arg lands in `args[i]` as a row-major 2-D array of scalars; empty cells
 * arrive as `null`. The demo's `SUMSQ2` flattens and sums squares
 * (`Number(null) === 0`), which makes both properties observable from the
 * cell display alone.
 */

async function gotoWorker(page: Page) {
  await gotoRoot(page)
  await page.getByTestId('nav-tab-vnext-worker').click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  // Seeded projection ready gate: Sheet1!C2 = 13.
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

async function typeIntoWorkerCell(page: Page, addr: string, value: string) {
  await cell(page, addr).dblclick()
  const input = cellInput(page, addr)
  await expect(input).toBeVisible()
  await input.fill(value)
  await input.press('Enter')
  await expect(input).toHaveCount(0)
}

test.describe('custom formulas — 2-D range marshaling', () => {
  test('M×N range (rows × cols both > 1) marshals row-major', async ({ page }) => {
    await gotoWorker(page)
    // Overwrite the seeded text cells with a 2×2 numeric block.
    await typeIntoWorkerCell(page, 'B2', '1')
    await typeIntoWorkerCell(page, 'B3', '2')
    await typeIntoWorkerCell(page, 'C2', '3')
    await typeIntoWorkerCell(page, 'C3', '4')

    // SUMSQ2 flattens the 2-D arg: 1 + 4 + 9 + 16 = 30. A marshaling bug
    // that dropped the second column (the Nx1-only shape the legacy spec
    // pins) would land on 5 instead.
    await typeIntoWorkerCell(page, 'E6', '=SUMSQ2(B2:C3)')
    await expect(cellDisplay(page, 'E6')).toHaveText('30')
  })

  test('empty cell inside the range arrives as a null scalar', async ({ page }) => {
    await gotoWorker(page)
    await typeIntoWorkerCell(page, 'B2', '3')
    // B3 seeded as text — clear it so the range holds a genuine empty.
    await cell(page, 'B3').click()
    await page.keyboard.press('Delete')
    await expect(cellDisplay(page, 'B3')).toHaveText('')

    // [[3], [null]] → 9 + Number(null)² = 9. A marshaling layer that
    // dropped or stringified the empty row would break the sum.
    await typeIntoWorkerCell(page, 'E6', '=SUMSQ2(B2:B3)')
    await expect(cellDisplay(page, 'E6')).toHaveText('9')
  })
})
