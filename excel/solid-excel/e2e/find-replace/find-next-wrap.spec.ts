import { expect, test, type Page } from '@playwright/test'
import { cell, expectNoConsoleErrors, guardConsoleErrors, withEnglishLocale } from '../helpers'

/**
 * FR-12 (CASES.md): Find Next / Find Previous cycle through the match
 * set and wrap around at both ends. Cursor semantics pinned from
 * `stepFindReplaceAtom`: `(index ± 1 + len) % len`, i.e. stepping past
 * the last match returns to the first and stepping back from the first
 * returns to the last. The seeded needle "240" hits exactly two cells:
 * D2 (North Q3) and D3 (South Q3).
 */

async function gotoWave5(page: Page) {
  await page.goto(withEnglishLocale())
  await page.getByTestId('nav-tab-vnext-wave5').click()
  await expect(page.getByTestId('wave5-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cell(page, 'B2').locator('.cell-display')).toHaveText('120')
}

function statusText(page: Page) {
  return page.getByTestId('find-status-text')
}

test.describe('Find Next — cursor cycle and wrap-around', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('find-next wraps forward past the last match; find-prev wraps backward', async ({
    page,
  }) => {
    await gotoWave5(page)
    await cell(page, 'A1').click()
    await page.getByTestId('toolbar-btn-find-replace').click()
    await expect(page.getByTestId('wave5-find-replace')).toBeVisible()

    await page.getByTestId('find-needle-input').fill('240')
    const next = page.getByTestId('find-next-button')
    const prev = page.getByTestId('find-prev-button')

    // First click runs the search and focuses match 1 of 2 (D2).
    await next.click()
    await expect(statusText(page)).toHaveText('1 of 2')
    await expect(cell(page, 'D2')).toHaveAttribute('data-active', 'true')

    // Second click advances to match 2 of 2 (D3).
    await next.click()
    await expect(statusText(page)).toHaveText('2 of 2')
    await expect(cell(page, 'D3')).toHaveAttribute('data-active', 'true')
    await expect(cell(page, 'D2')).toHaveAttribute('data-active', 'false')

    // Third click wraps forward to match 1 again.
    await next.click()
    await expect(statusText(page)).toHaveText('1 of 2')
    await expect(cell(page, 'D2')).toHaveAttribute('data-active', 'true')

    // Stepping back from the first match wraps to the last.
    await prev.click()
    await expect(statusText(page)).toHaveText('2 of 2')
    await expect(cell(page, 'D3')).toHaveAttribute('data-active', 'true')

    // The dialog never closed during the whole cycle.
    await expect(page.getByTestId('wave5-find-replace')).toBeVisible()
  })
})
