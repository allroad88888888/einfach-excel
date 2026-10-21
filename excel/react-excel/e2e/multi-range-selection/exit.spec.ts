import { expect, test } from '@playwright/test'
import { cell, drag, expectSelected, nameBox, openOrders } from './pointer'

for (const width of [1280, 390]) {
  test(`ordinary click replaces manually appended areas with one cell at ${width}px`, async ({ page }) => {
    await openOrders(page, width)
    await cell(page, 2, 0).click()
    await drag(page, [5, 0], [6, 1], 'Meta')
    await cell(page, 4, 1).click()
    await expect(nameBox(page)).toHaveValue('B5')
    await expect(page.locator('td[data-selected="true"]')).toHaveCount(1)
    await expectSelected(page, 4, 1)
    await expectSelected(page, 2, 0, false)
    await expectSelected(page, 6, 1, false)
    await expect(page.getByRole('status', { name: 'Multi-area selection', exact: true })).toHaveCount(0)
  })

  test(`Escape exits manual multi-area selection and keeps only the primary rectangle at ${width}px`, async ({ page }) => {
    await openOrders(page, width)
    await cell(page, 2, 0).click()
    await drag(page, [5, 0], [6, 1], 'Meta')
    await page.keyboard.press('Escape')
    await expect(nameBox(page)).toHaveValue('A6:B7')
    await expect(page.locator('td[data-selected="true"]')).toHaveCount(4)
    await expectSelected(page, 2, 0, false)
    await expectSelected(page, 5, 0)
    await expectSelected(page, 6, 1)
    await expect(page.getByRole('status', { name: 'Multi-area selection', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}
