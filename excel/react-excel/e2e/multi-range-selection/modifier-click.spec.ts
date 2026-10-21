import { expect, test } from '@playwright/test'
import { cell, expectSelected, nameBox, openOrders } from './pointer'

for (const width of [1280, 390]) for (const modifier of ['Control', 'Meta'] as const) {
  test(`${modifier} click appends a disjoint cell and keeps the gap unselected at ${width}px`, async ({ page }, info) => {
    await openOrders(page, width)
    await cell(page, 2, 0).click()
    await cell(page, 5, 0).click({ modifiers: [modifier] })
    await expect(nameBox(page)).toHaveValue('A6')
    await expectSelected(page, 2, 0)
    await expectSelected(page, 5, 0)
    await expectSelected(page, 3, 0, false)
    await expect(page.locator('td[data-selected="true"]')).toHaveCount(2)
    await expect(page.getByRole('status', { name: 'Multi-area selection', exact: true }))
      .toContainText('2 cells selected in multiple areas')
    // Repeating the same modifier click activates that cell without another area.
    await cell(page, 2, 0).click({ modifiers: [modifier] })
    await expect(nameBox(page)).toHaveValue('A3')
    await expect(page.locator('td[data-selected="true"]')).toHaveCount(2)
    await expect(cell(page, 2, 0)).toHaveText('SO-10002')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await page.screenshot({ path: info.outputPath(`modifier-click-${modifier}-${width}.png`) })
  })
}
