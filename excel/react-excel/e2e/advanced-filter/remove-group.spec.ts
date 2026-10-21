import { test, expect } from '@playwright/test'
import { summary, alternatives, apply, records, button, open, undoRedo } from './support'

for (const width of [1280, 390]) test(`advanced filter Remove group removes only that OR alternative at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await summary(page); await alternatives(page); await apply(page)
  await open(page); await button(page, 'Remove group 2').click()
  await expect(button(page, 'Remove group 1')).toBeDisabled()
  await apply(page); await records(page, ['W20', 'W10'])
  await undoRedo(page, ['W20', 'E10', 'W10', 'E30'], ['W20', 'W10'])
})
