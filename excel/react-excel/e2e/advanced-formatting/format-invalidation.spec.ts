import { expect, test } from '@playwright/test'
import { start, go, numberFormat, compareDisplay, highlighted, cleanNeighbor, valueInput, button } from './support'

for (const width of [1280, 390]) {
  test(`AFMT-005 number format changes immediately refresh display duplicates at ${width}px`, async ({ page }) => {
    await start(page, width, ['0.5', '="50%"'])
    await compareDisplay(page)
    await highlighted(page, 0, false); await highlighted(page, 1, false)
    await numberFormat(page, 'A1', 'percent')
    await highlighted(page, 0); await highlighted(page, 1)
    await button(page, 'Undo').click()
    await highlighted(page, 0, false); await highlighted(page, 1, false)
    await button(page, 'Redo').click()
    await highlighted(page, 0); await highlighted(page, 1)
    await go(page, 'A1'); await expect(valueInput(page)).toHaveValue('0.5')
    await valueInput(page).fill('0.25'); await valueInput(page).press('Enter')
    await highlighted(page, 0, false); await highlighted(page, 1, false)
    await button(page, 'Undo').click(); await highlighted(page, 0); await highlighted(page, 1)
    await cleanNeighbor(page)
  })
}
