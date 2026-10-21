import { test, expect } from '@playwright/test'
import { summary, alternatives, apply, records, button, menu, open } from './support'

for (const width of [1280, 390]) test(`advanced filter Add OR group includes either alternative in one apply at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await summary(page)
  await alternatives(page)
  await expect(page.getByRole('group', { name: 'Filter group 2' })).toBeVisible()
  await records(page, ['W20', 'E10', 'W10', 'E30'])
  await apply(page)
  await records(page, ['W20', 'E10', 'W10', 'E30'])
  await button(page, 'Undo').click()
  await expect(button(page, 'Filter column A')).toHaveAttribute('data-filtered', 'false')
  await button(page, 'Redo').click()
  await expect(button(page, 'Filter column A')).toHaveAttribute('data-filtered', 'true')
  await expect(menu(page)).toBeEnabled()
  await open(page)
  await expect(page.getByLabel('Filter value 2', { exact: true })).toHaveValue('East')
})
