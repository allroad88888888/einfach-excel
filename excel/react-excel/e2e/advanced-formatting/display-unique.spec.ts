import { expect, test } from '@playwright/test'
import { start, go, numberFormat, compareDisplay, highlighted, cleanNeighbor, open, button, save } from './support'

for (const width of [1280, 390]) {
  test(`AFMT-004 toolbar unique rule distinguishes equal values with different displays at ${width}px`, async ({ page }) => {
    await start(page, width, ['1', '1', '="1"', '2', '=""', '=1/0'])
    await numberFormat(page, 'A2', 'percent')
    await go(page, 'A1:A6'); await compareDisplay(page, 'unique')
    for (let row = 0; row < 7; row++) await highlighted(page, row, [1, 3].includes(row))
    await cleanNeighbor(page)
    await open(page); await button(page, 'Edit rule 1').click()
    await expect(page.getByLabel('Compare by', { exact: true })).toHaveValue('display-text')
    await page.getByLabel('Compare by', { exact: true }).selectOption('value'); await save(page, true)
    for (let row = 0; row < 6; row++) await highlighted(page, row, [2, 3].includes(row))
  })
}
