import { expect, test, type Page } from '@playwright/test'
import { chooseColor, colorFilterFile } from '../support/color-filter'
import { button, cell, dialog, enable } from '../support/date-filter'

async function mount(page: Page) {
  await page.setViewportSize({ width: 1280, height: 850 })
  await page.addInitScript((snapshot) => {
    ;(window as unknown as { __COLOR_SNAPSHOT__?: string }).__COLOR_SNAPSHOT__ = snapshot
  }, colorFilterFile().toString())
  await page.goto('/e2e/fixtures/plugin-hosts/?case=color-async')
  await expect(cell(page, '1:1')).toHaveText('Red solid', { timeout: 15_000 })
  await enable(page, 'A1:B8')
}

test('Pending color candidates can be closed without a late update', async ({ page }) => {
  await mount(page)
  await chooseColor(page, 'fill')
  await button(page, 'Choose a color from this column').click()
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-pending-colors', '1')
  await expect(dialog(page).getByRole('status')).toHaveText('Loading column colors…')
  await button(page, 'Hide column colors').click()
  await page.keyboard.press('Alt+r')
  await expect(root).toHaveAttribute('data-pending-colors', '0')
  await expect(button(page, 'Choose a color from this column')).toHaveAttribute('aria-expanded', 'false')
  await expect(button(page, '#c00000 (2 rows)')).toHaveCount(0)
  await button(page, 'Choose a color from this column').click()
  await expect(button(page, '#c00000 (2 rows)')).toBeVisible()
  await expect(button(page, 'No fill')).toHaveAttribute('aria-pressed', 'true')
  await expect(cell(page, '1:1')).toHaveText('Red solid')
  await expect(cell(page, '2:1')).toHaveText('Pattern')
})
