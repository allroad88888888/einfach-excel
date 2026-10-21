import { test, expect } from '@playwright/test'
import { summary, alternatives, apply, records, button, minimum, open, undoRedo } from './support'

for (const width of [1280, 390]) test(`advanced filter Remove condition retains its nonempty group at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await summary(page); await alternatives(page)
  await button(page, 'Add condition to group 2').click(); await minimum(page, 3, '20')
  await apply(page); await records(page, ['W20', 'W10', 'E30'])
  await open(page); await button(page, 'Remove condition 3').click()
  await expect(button(page, 'Remove condition 2')).toBeDisabled()
  await apply(page); await records(page, ['W20', 'E10', 'W10', 'E30'])
  await undoRedo(page, ['W20', 'W10', 'E30'], ['W20', 'E10', 'W10', 'E30'])
})
