import { test, expect } from '@playwright/test'
import { summary, alternatives, apply, records, button, minimum, menu, select, open } from './support'

for (const width of [1280, 390]) test(`advanced filter Reapply refreshes grouped snapshots only on demand at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 })
  await summary(page); await alternatives(page)
  await button(page, 'Add condition').click(); await minimum(page, 3, '15')
  await apply(page); await records(page, ['W20', 'E10', 'E30'])
  await select(page, 'B26', '25:1')
  const input = page.getByRole('textbox', { name: 'Active cell value' })
  await input.fill('5'); await input.press('Enter')
  await expect(cellAt(page, '25:2')).toHaveText('W20')
  await menu(page).selectOption('reapply'); await records(page, ['E10', 'E30'])
  await button(page, 'Undo').click(); await records(page, ['W20', 'E10', 'E30'])
  await button(page, 'Redo').click(); await records(page, ['E10', 'E30'])
  await open(page)
  await expect(page.getByLabel('Minimum 2', { exact: true })).toHaveValue('15')
})
function cellAt(page: import('@playwright/test').Page, coord: string) { return page.locator(`td[data-cell="${coord}"]`) }
