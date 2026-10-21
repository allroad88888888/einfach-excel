import { test, expect } from '@playwright/test'
import { summary, alternatives, apply, records, button, minimum, undoRedo } from './support'

for (const width of [1280, 390]) test(`advanced filter Add condition intersects only its AND group at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await summary(page); await alternatives(page)
  await button(page, 'Add condition').click()
  await minimum(page, 3, '15')
  await expect(page.getByRole('group', { name: 'Filter group 1' }).getByLabel('Minimum 3')).toHaveValue('15')
  await apply(page)
  await records(page, ['W20', 'E10', 'E30'])
  await undoRedo(page, ['W20', 'E10', 'W10', 'E30'], ['W20', 'E10', 'E30'])
})
