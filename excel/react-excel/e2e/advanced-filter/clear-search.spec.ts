import { test, expect } from '@playwright/test'
import { orders, search, button, choice, apply, cell, select } from './support'

for (const width of [1280, 390]) test(`advanced filter Clear all search matches removes only the complete current query at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await orders(page); await search(page, 'SO-10'); await button(page, 'Select all search matches').click()
  await expect(page.getByLabel('Selected filter values')).toHaveText('998 selected')
  await search(page, 'SO-100')
  await expect(page.getByLabel('Selected filter values')).toHaveText('998 selected')
  await button(page, 'Clear all search matches').click()
  await expect(page.getByLabel('Selected filter values')).toHaveText('900 selected')
  await expect(choice(page, 'SO-10001')).not.toBeChecked()
  await search(page, 'SO-10999'); await expect(choice(page, 'SO-10999')).toBeChecked()
  await apply(page)
  await select(page, 'A101', '100:0')
  await expect(cell(page, 100, 0)).toHaveText('SO-10100')
  await expect(cell(page, 99, 0)).toHaveCount(0)
  await button(page, 'Undo').click()
  await select(page, 'A2', '1:0'); await expect(cell(page, 1, 0)).toHaveText('SO-10001')
  await button(page, 'Redo').click()
  await expect(cell(page, 1, 0)).toHaveCount(0)
})
