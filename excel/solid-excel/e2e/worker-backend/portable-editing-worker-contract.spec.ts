import { expect, test, type Page } from '@playwright/test'

import {
  cell,
  cellDisplay,
  cellInput,
  expectNoConsoleErrors,
  gotoRoot,
  guardConsoleErrors,
} from '../helpers'

/** Opens the actual worker demo selected by the active Playwright project. */
async function gotoWorkerDemo(page: Page) {
  guardConsoleErrors(page)
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

test.describe('portable editing commands on real workers', () => {
  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('projection source text and keyboard reference commit survive the worker boundary', async ({
    page,
  }) => {
    await gotoWorkerDemo(page)

    // C2 is calculated as 13, but the formula bar must use projection source,
    // not the evaluated value. Its formula reaches through the three-sheet seed.
    await cell(page, 'C2').click()
    await expect(page.getByTestId('formula-bar-input')).toHaveValue('=Sheet2!C2+1')

    // Enter formula reference mode in an empty cell. ArrowLeft is handled by
    // the portable command rather than normal selection navigation.
    await cell(page, 'D2').click()
    await page.keyboard.press('=')
    const editor = cellInput(page, 'D2')
    await expect(editor).toHaveValue('=')
    await page.keyboard.press('ArrowLeft')
    await expect(editor).toHaveValue('=C2')

    await page.keyboard.press('Enter')
    await expect(editor).toHaveCount(0)
    await expect(cellDisplay(page, 'D2')).toHaveText('13')
    await cell(page, 'D2').click()
    await expect(page.getByTestId('formula-bar-input')).toHaveValue('=C2')
  })

  test('formula-bar suggestion acceptance preserves its editing focus', async ({ page }) => {
    await gotoWorkerDemo(page)
    await cell(page, 'E4').click()

    const bar = page.getByTestId('formula-bar-input')
    await bar.click()
    await page.keyboard.type('=SU')
    await expect(page.getByTestId('formula-autocomplete-row-SUM')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // Formula-bar keyboard routing reads and accepts the portable suggestion.
    await page.keyboard.press('Tab')
    await expect(bar).toHaveValue('=SUM(')
    await expect(bar).toBeFocused()
    await expect(cellInput(page, 'E4')).toHaveValue('=SUM(')
  })
})
