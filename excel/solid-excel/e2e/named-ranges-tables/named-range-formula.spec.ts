import { expect, test, type Page } from '@playwright/test'
import {
  cell,
  cellDisplay,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
  typeIntoCell,
  withEnglishLocale,
} from '../helpers'

/**
 * Named ranges inside live formulas: define → =SUM(MyRange) → delete →
 * the dependent formula degrades to #NAME?.
 *
 * Engine split (named-range-capability-port.ts):
 *   - TS worker: `bindings.range = true`, `rangeSemantics: 'live-reference'`
 *     — defineName stores a live range binding and recalcs; undefineName
 *     recalcs dependents into #NAME? (worker-runtime-ts.ts).
 *   - WASM worker: the runtime REFUSES defineName/undefineName
 *     (`NAME_BINDING_UNSUPPORTED`, worker-runtime.ts) and the capability
 *     port declares every binding false — the Name Manager is read-only.
 *
 * So the formula flow runs on the dedicated vNext Worker TS demo (an
 * in-process TS worker regardless of the Playwright project, same as
 * worker-backend/vnext-worker-ts-lambda.spec.ts), and the wasm demo gets a
 * fail-closed assertion instead.
 */

async function gotoWorkerTsDemo(page: Page) {
  guardConsoleErrors(page)
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-worker-ts').click()
  await expect(page.getByTestId('vnext-worker-ts-grid')).toBeVisible({ timeout: 30_000 })
  // Seeded =SUM(B2:B4) settles — the TS engine round-trip is live.
  await expect(cellDisplay(page, 'B5')).toHaveText('60', { timeout: 30_000 })
}

function activeProjectIsWasm(): boolean {
  try {
    return test.info().project.name !== 'ts'
  } catch {
    return true
  }
}

test.describe('named ranges in formulas — TS engine live reference', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('=SUM(MyRange) resolves a saved name and deleting it degrades to #NAME?', async ({
    page,
  }) => {
    await gotoWorkerTsDemo(page)

    // Define MyRange = Sheet1!B2:B4 (10 + 20 + 30) through the dialog.
    await page.getByTestId('toolbar-btn-name-manager').click()
    const dialog = page.getByTestId('vnext-worker-ts-name-manager')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('name-input').fill('MyRange')
    await dialog.getByTestId('name-mgr-kind-select').selectOption('range')
    await dialog.getByTestId('name-refers-to').fill('B2:B4')
    await dialog.getByTestId('name-save-button').click()
    // Dialog auto-closes on the acknowledged save.
    await expect(dialog).toHaveCount(0)

    // The name resolves inside a live aggregate.
    await typeIntoCell(page, 'H1', '=SUM(MyRange)')
    await expect(cellDisplay(page, 'H1')).toHaveText('60')

    // A named reference is live: editing the underlying cell recomputes it.
    await typeIntoCell(page, 'B2', '40')
    await expect(cellDisplay(page, 'H1')).toHaveText('90')

    // Delete the name: select its list entry, then Delete.
    await page.getByTestId('toolbar-btn-name-manager').click()
    await expect(dialog).toBeVisible()
    await dialog.locator('[data-name="MyRange"]').locator('button').click()
    const deleteBtn = dialog.getByTestId('name-delete-button')
    await expect(deleteBtn).toBeEnabled()
    await deleteBtn.click()
    // Same close-on-ack contract as save.
    await expect(dialog).toHaveCount(0)

    // Nudge an unrelated cell so the visible projection refetches (the
    // engine already recalced on undefineName), then the dependent formula
    // must surface #NAME?.
    await typeIntoCell(page, 'G1', '1')
    await expect(cellDisplay(page, 'H1')).toHaveText('#NAME?')
  })

  test('wasm worker Name Manager is fail-closed read-only for names', async ({ page }) => {
    test.skip(
      !activeProjectIsWasm(),
      'ts project drives the TS backend where name mutations are supported',
    )
    guardConsoleErrors(page)
    await gotoRoot(page)
    await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
    await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
    await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })

    await cell(page, 'A1').click()
    await page.getByTestId('toolbar-btn-name-manager').click()
    const dialog = page.getByTestId('vnext-worker-name-manager')
    await expect(dialog).toBeVisible()

    // Capabilities resolve (not merely still loading) yet declare no scope
    // and no binding — save/delete stay disabled even with a valid draft.
    await expect(dialog).toHaveAttribute('data-capability-status', 'ready')
    await dialog.getByTestId('name-input').fill('MyRange')
    await dialog.getByTestId('name-refers-to').fill('B2:B4')
    await expect(dialog.getByTestId('name-save-button')).toBeDisabled()
    await expect(dialog.getByTestId('name-delete-button')).toBeDisabled()
  })
})
