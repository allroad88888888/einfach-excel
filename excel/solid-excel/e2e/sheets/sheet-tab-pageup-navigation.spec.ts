import { expect, test, type Page } from '@playwright/test'

import { cellDisplay, expectNoConsoleErrors, gotoRoot, guardConsoleErrors } from '../helpers'

async function gotoWorkerDemo(page: Page) {
  await gotoRoot(page)
  await page.getByRole('button', { name: 'vNext Worker', exact: true }).click()
  await expect(page.getByTestId('vnext-worker-grid')).toBeVisible({ timeout: 30_000 })
  await expect(cellDisplay(page, 'C2')).toHaveText('13', { timeout: 30_000 })
}

test.describe('Sheet tab Ctrl+PageUp navigation', () => {
  test.beforeEach(async ({ page }) => {
    guardConsoleErrors(page)
  })

  test.afterEach(async ({ page }) => {
    await expectNoConsoleErrors(page)
  })

  test('Ctrl+PageUp activates the previous sheet and moves tab focus', async ({ page }) => {
    await gotoWorkerDemo(page)

    const backend = test.info().project.name
    expect(['wasm', 'ts']).toContain(backend)
    expect(new URL(page.url()).searchParams.get('backend')).toBe(backend)

    const sheetTabs = page.getByTestId('vnext-worker-sheet-tabs')
    const sheet1 = sheetTabs.getByRole('tab', { name: 'Sheet1', exact: true })
    const sheet2 = sheetTabs.getByRole('tab', { name: 'Sheet2', exact: true })

    await sheet2.click()
    await expect(sheet2).toHaveAttribute('aria-selected', 'true')
    await expect(sheet2).toBeFocused()

    await page.keyboard.press('Control+PageUp')

    await expect(sheet1).toHaveAttribute('data-active', 'true')
    await expect(sheet1).toHaveAttribute('aria-selected', 'true')
    await expect(sheet1).toHaveAttribute('tabindex', '0')
    await expect(sheet2).toHaveAttribute('aria-selected', 'false')
    await expect(sheet2).toHaveAttribute('tabindex', '-1')
    await expect(sheet1).toBeFocused()
  })
})
