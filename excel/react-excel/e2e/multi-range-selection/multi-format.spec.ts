import { expect, test } from '@playwright/test'
import { cell, drag, openOrders } from './pointer'

for (const width of [1280, 390]) {
  test(`formatting manually appended areas changes every target and preserves the gap at ${width}px`, async ({ page }) => {
    await openOrders(page, width)
    const gapWeight = await cell(page, 4, 0).evaluate(node => getComputedStyle(node).fontWeight)
    const outsideWeight = await cell(page, 8, 1).evaluate(node => getComputedStyle(node).fontWeight)
    await cell(page, 2, 0).click()
    await drag(page, [5, 0], [6, 1], 'Meta')
    await page.getByRole('button', { name: 'Bold', exact: true }).click()
    await expect(cell(page, 2, 0)).toHaveCSS('font-weight', '700')
    for (let row = 5; row <= 6; row++) for (let col = 0; col <= 1; col++)
      await expect(cell(page, row, col)).toHaveCSS('font-weight', '700')
    await expect(cell(page, 4, 0)).toHaveCSS('font-weight', gapWeight)
    await expect(cell(page, 8, 1)).toHaveCSS('font-weight', outsideWeight)
    await expect(cell(page, 2, 0)).toHaveText('SO-10002')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, 5, 1)).toHaveCSS('font-weight', '400')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(cell(page, 5, 1)).toHaveCSS('font-weight', '700')
    await expect(cell(page, 4, 0)).toHaveCSS('font-weight', gapWeight)
  })
}
