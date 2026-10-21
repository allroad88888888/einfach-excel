import { expect, test } from '@playwright/test'
import { cell, drag, openOrders } from './pointer'

for (const width of [1280, 390]) {
  test(`clearing manually appended areas preserves gap values and undoes in one step at ${width}px`, async ({ page }) => {
    await openOrders(page, width)
    const gap = await cell(page, 4, 0).textContent()
    const originals = await Promise.all([[2, 0], [5, 0], [5, 1], [6, 0], [6, 1]]
      .map(([row, col]) => cell(page, row, col).textContent()))
    await cell(page, 2, 0).click()
    await drag(page, [5, 0], [6, 1], 'Meta')
    await page.getByRole('button', { name: 'Clear contents', exact: true }).click()
    for (const [row, col] of [[2, 0], [5, 0], [5, 1], [6, 0], [6, 1]])
      await expect(cell(page, row, col)).toHaveText('')
    await expect(cell(page, 4, 0)).toHaveText(gap!)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    for (const [index, [row, col]] of [[2, 0], [5, 0], [5, 1], [6, 0], [6, 1]].entries())
      await expect(cell(page, row, col)).toHaveText(originals[index]!)
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}
