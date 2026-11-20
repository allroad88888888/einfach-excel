import { expect, test } from '@playwright/test'
import { showRibbonItem } from '../support/ribbon'
import { expectShrinkFits, shrinkText } from '../support/shrink-to-fit'

test('shrink belongs to one plugin instance while uninstall preserves the shared workbook facts', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto('/e2e/fixtures/plugin-hosts/?case=shrink')
  const first = page.locator('#first'), second = page.locator('#second')
  const a = first.locator('td[data-cell="0:0"]'), b = second.locator('td[data-cell="0:0"]')
  await expect(a).toContainText('First long inventory', { timeout: 15_000 })
  await expect(b).toContainText('Second long inventory', { timeout: 15_000 })
  await showRibbonItem(first, 'format.shrink-to-fit')
  await first.getByRole('button', { name: 'Shrink to fit', exact: true }).click()
  const before = await expectShrinkFits(a)
  await expect(shrinkText(b)).toHaveCount(0)
  await expect(second.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await page.keyboard.press('Alt+u')
  await expect(page.locator('#host-event')).toHaveText('uninstalled')
  await expect(first.getByRole('button', { name: 'Shrink to fit', exact: true })).toHaveCount(0)
  const retained = await expectShrinkFits(a)
  expect(retained.width).toBeCloseTo(before.width, 1)
  await page.keyboard.press('Alt+u')
  await showRibbonItem(first, 'format.shrink-to-fit')
  await expect(first.getByRole('button', { name: 'Shrink to fit', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await first.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(shrinkText(a)).toHaveCount(0)
  await expect(first.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await expect(b).toContainText('Second long inventory')
})
