import { test, expect } from '@playwright/test'
import { summary, alternatives, apply, records, open, field, undoRedo } from './support'

for (const width of [1280, 390]) test(`advanced filter editing one grouped condition preserves the other group at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await summary(page); await alternatives(page); await apply(page)
  await open(page); await field(page, 2, 'Missing')
  await apply(page); await records(page, ['W20', 'W10'])
  await undoRedo(page, ['W20', 'E10', 'W10', 'E30'], ['W20', 'W10'])
  await open(page)
  await expect(page.getByLabel('Filter value 1', { exact: true })).toHaveValue('West')
  await expect(page.getByLabel('Filter value 2', { exact: true })).toHaveValue('Missing')
})
