import { expect, test } from '@playwright/test'
import { start, go, numberFormat, compareDisplay, highlighted, cleanNeighbor, open, button, save, valueInput } from './support'

for (const width of [1280, 390]) {
  test(`AFMT-003 toolbar duplicate rule compares native base display text at ${width}px`, async ({ page }) => {
    await start(page, width, ['1', '="1"', '0.5', '="50%"', '1.04', '1.03', '1', '="1900-01-01"'])
    await numberFormat(page, 'A3', 'percent')
    await numberFormat(page, 'A5:A6', 'number', '1')
    await numberFormat(page, 'A7', 'date')
    await go(page, 'A1:A8'); await compareDisplay(page)
    for (let row = 0; row < 8; row++) await highlighted(page, row)
    await go(page, 'A1')
    await expect(valueInput(page)).toHaveValue('1')
    await cleanNeighbor(page)
    await open(page); await button(page, 'Edit rule 1').click()
    await page.getByLabel('Compare by', { exact: true }).selectOption('value'); await save(page, true)
    for (let row = 0; row < 8; row++) await highlighted(page, row, [0, 6].includes(row))
    await go(page, 'A3'); await expect(valueInput(page)).toHaveValue('0.5')
    await go(page, 'A4'); await expect(valueInput(page)).toHaveValue('="50%"')
  })
}
