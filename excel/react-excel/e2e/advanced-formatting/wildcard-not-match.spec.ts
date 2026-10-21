import { test } from '@playwright/test'
import { start, open, save, highlighted, cleanNeighbor } from './support'

for (const width of [1280, 390]) {
  test(`AFMT-002 toolbar wildcard non-match uses whole text and skips errors at ${width}px`, async ({ page }) => {
    await start(page, width, ['Ready', 'READY now', 'not ready', ' Ready', 'x*y', '=""', '=1/0', '123'])
    await open(page, 'text')
    await page.getByLabel('Text condition', { exact: true }).selectOption('not-matches-wildcard')
    await page.getByLabel('Matching text', { exact: true }).fill('ready*')
    await save(page)
    for (let row = 0; row < 9; row++) await highlighted(page, row, [2, 3, 4, 5].includes(row))
    await cleanNeighbor(page)
  })
}
