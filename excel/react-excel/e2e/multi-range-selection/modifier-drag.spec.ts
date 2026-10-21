import { expect, test } from '@playwright/test'
import { cell, drag, expectSelected, nameBox, openOrders } from './pointer'

for (const width of [1280, 390]) {
  test(`modifier drag appends a rectangle without replacing previous cells at ${width}px`, async ({ page }, info) => {
    await openOrders(page, width)
    await cell(page, 2, 0).click()
    await drag(page, [5, 0], [7, 1], 'Meta')
    await expect(nameBox(page)).toHaveValue('A6:B8')
    await expectSelected(page, 2, 0)
    for (let row = 5; row <= 7; row++) for (let col = 0; col <= 1; col++)
      await expectSelected(page, row, col)
    await expectSelected(page, 4, 0, false)
    await expectSelected(page, 3, 1, false)
    await expect(page.locator('td[data-selected="true"]')).toHaveCount(7)
    await page.mouse.move(30, 30)
    await expect(nameBox(page)).toHaveValue('A6:B8')
    await page.screenshot({ path: info.outputPath(`modifier-drag-${width}.png`) })
  })
}
