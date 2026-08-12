import { expect, test, type Page } from '@playwright/test'

import { cellDisplay, expectNoConsoleErrors, typeIntoCell } from '../helpers'
import {
  activeProjectIsWasm,
  gotoWorkerDemo,
  selectGridCell,
  sortHistoryEntry,
} from './worker-demo-helpers'

type SortDirection = 'asc' | 'desc'

function sortMenuItem(page: Page, direction: SortDirection) {
  return page.getByTestId(
    direction === 'asc' ? 'menu-bar-item-data.sortAsc' : 'menu-bar-item-data.sortDesc',
  )
}

async function seedSortColumn(page: Page) {
  await typeIntoCell(page, 'E2', '3')
  await typeIntoCell(page, 'E3', '1')
  await typeIntoCell(page, 'E4', '2')
  await selectGridCell(page, 'E4')
}

async function expectSeedOrder(page: Page) {
  await expect(cellDisplay(page, 'E2')).toHaveText('3')
  await expect(cellDisplay(page, 'E3')).toHaveText('1')
  await expect(cellDisplay(page, 'E4')).toHaveText('2')
}

async function openMenuSortConfirmation(page: Page, direction: SortDirection) {
  await page.getByTestId('menu-bar-button-data').click()
  const item = sortMenuItem(page, direction)
  await expect(item).toBeVisible()
  await item.click()

  const dialog = page.getByTestId('sort-confirmation-dialog')
  await expect(dialog).toHaveAttribute('data-status', 'ready')
  return dialog
}

test.describe('vNext worker Data menu sort confirmation', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('WASM: cancel and Escape keep data unchanged and restore focus to Data', async ({
    page,
  }) => {
    test.skip(!activeProjectIsWasm(), 'Physical sorting is only available in the WASM worker.')

    await gotoWorkerDemo(page)
    await seedSortColumn(page)
    const dataButton = page.getByTestId('menu-bar-button-data')

    const cancelDialog = await openMenuSortConfirmation(page, 'asc')
    await expect(sortHistoryEntry(page)).toHaveCount(0)
    await expectSeedOrder(page)
    await cancelDialog.getByTestId('sort-confirmation-cancel').click()
    await expect(cancelDialog).toHaveCount(0)
    await expect(dataButton).toBeFocused()
    await expect(sortHistoryEntry(page)).toHaveCount(0)
    await expectSeedOrder(page)

    const escapeDialog = await openMenuSortConfirmation(page, 'asc')
    await expect(sortHistoryEntry(page)).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(escapeDialog).toHaveCount(0)
    await expect(dataButton).toBeFocused()
    await expect(sortHistoryEntry(page)).toHaveCount(0)
    await expectSeedOrder(page)
  })

  test('WASM: confirm closes the dialog and runs one descending physical sort', async ({
    page,
  }) => {
    test.skip(!activeProjectIsWasm(), 'Physical sorting is only available in the WASM worker.')

    await gotoWorkerDemo(page)
    await seedSortColumn(page)
    const dataButton = page.getByTestId('menu-bar-button-data')
    const dialog = await openMenuSortConfirmation(page, 'desc')

    await expect(sortHistoryEntry(page)).toHaveCount(0)
    await expectSeedOrder(page)
    await dialog.getByTestId('sort-confirmation-confirm').click()

    await expect(dialog).toHaveCount(0)
    await expect(dataButton).toBeFocused()
    await expect(sortHistoryEntry(page)).toHaveCount(1)
    await expect(cellDisplay(page, 'E2')).toHaveText('3')
    await expect(cellDisplay(page, 'E3')).toHaveText('2')
    await expect(cellDisplay(page, 'E4')).toHaveText('1')
  })

  test('TS: Data menu fail-closes physical sort without a dialog or mutation', async ({ page }) => {
    test.skip(activeProjectIsWasm(), 'The WASM project exposes physical sorting.')

    await gotoWorkerDemo(page)
    await seedSortColumn(page)
    await page.getByTestId('menu-bar-button-data').click()

    await expect(sortMenuItem(page, 'asc')).toHaveCount(0)
    await expect(sortMenuItem(page, 'desc')).toHaveCount(0)
    await expect(page.getByTestId('sort-confirmation-dialog')).toHaveCount(0)
    await expect(sortHistoryEntry(page)).toHaveCount(0)
    await expectSeedOrder(page)
  })
})
