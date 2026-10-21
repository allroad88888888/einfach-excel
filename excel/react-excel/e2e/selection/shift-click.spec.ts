import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, row: number, col: number) => page.locator(`td[data-cell="${row}:${col}"]`)
const name = (page: Page) => page.getByRole('textbox', { name: 'Name box', exact: true })

for (const width of [1280, 390]) {
  test(`Shift click extends from the original cell at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await cell(page, 2, 0).click()
    await cell(page, 5, 1).click({ modifiers: ['Shift'] })
    await expect(name(page)).toHaveValue('A3:B6')
    await expect(page.locator('td[data-selected="true"]')).toHaveCount(8)
    await expect(cell(page, 2, 0)).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 5, 1)).toHaveAttribute('data-selected', 'true')
    await expect(cell(page, 6, 1)).not.toHaveAttribute('data-selected')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })

  test(`repeated Shift clicks shrink and reverse without moving the anchor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await cell(page, 5, 1).click()
    for (const [row, col, address] of [[8, 1, 'B6:B9'], [6, 1, 'B6:B7'], [2, 0, 'A3:B6']] as const) {
      await cell(page, row, col).click({ modifiers: ['Shift'] })
      await expect(name(page)).toHaveValue(address)
    }
    await cell(page, 4, 1).click()
    await expect(name(page)).toHaveValue('B5')
    await cell(page, 6, 0).click({ modifiers: ['Shift'] })
    await expect(name(page)).toHaveValue('A5:B7')
  })

  test(`Shift drag continues the existing anchor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await cell(page, 2, 0).click()
    const start = (await cell(page, 4, 1).boundingBox())!
    const end = (await cell(page, 7, 1).boundingBox())!
    await page.keyboard.down('Shift')
    await page.mouse.move(start.x + 20, start.y + 12)
    await page.mouse.down()
    await page.mouse.move(end.x + 20, end.y + 12, { steps: 3 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect(name(page)).toHaveValue('A3:B8')
    await page.mouse.move(end.x + 20, end.y + 50)
    await expect(name(page)).toHaveValue('A3:B8')
  })

  test(`formatting applies to every Shift selected cell at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    const outside = cell(page, 6, 1)
    const original = await outside.evaluate(node => getComputedStyle(node).fontWeight)
    await cell(page, 2, 0).click()
    await cell(page, 5, 1).click({ modifiers: ['Shift'] })
    await page.getByRole('button', { name: 'Bold', exact: true }).click()
    for (let row = 2; row <= 5; row++) for (let col = 0; col <= 1; col++)
      await expect(cell(page, row, col)).toHaveCSS('font-weight', '700')
    await expect(outside).toHaveCSS('font-weight', original)
    await expect(cell(page, 2, 0)).toHaveText('SO-10002')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(cell(page, 5, 1)).toHaveCSS('font-weight', '400')
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  })
}
