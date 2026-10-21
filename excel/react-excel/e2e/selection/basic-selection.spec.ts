import { expect, test, type Page } from '@playwright/test'

const cell = (page: Page, row: number, col: number) => page.locator(`td[data-cell="${row}:${col}"]`)
const name = (page: Page) => page.getByRole('textbox', { name: 'Name box', exact: true })

for (const width of [1280, 390]) {
  test.describe(`${width}px selection`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 850 })
      await page.goto('/e2e/fixtures/plain-sales-orders/')
    })

    test(`single cell click replaces the selection at ${width}px`, async ({ page }) => {
      await cell(page, 2, 0).click()
      await expect(name(page)).toHaveValue('A3')
      await cell(page, 4, 1).click()
      await expect(name(page)).toHaveValue('B5')
      await expect(page.locator('td[data-selected="true"]')).toHaveCount(1)
      await expect(page.locator('[data-workbook-grid]')).toBeFocused()
    })

    test(`pointer drag selects a rectangle at ${width}px`, async ({ page }) => {
      const from = (await cell(page, 2, 0).boundingBox())!
      const to = (await cell(page, 5, 1).boundingBox())!
      await page.mouse.move(from.x + 20, from.y + 12)
      await page.mouse.down()
      await page.mouse.move(to.x + 20, to.y + 12, { steps: 4 })
      await page.mouse.up()
      await expect(name(page)).toHaveValue('A3:B6')
      await expect(page.locator('td[data-selected="true"]')).toHaveCount(8)
      await page.mouse.move(to.x + 20, to.y + 50)
      await expect(name(page)).toHaveValue('A3:B6')
    })

    for (const [kind, role, label, address] of [
      ['row', 'button', 'Select row 3', 'A3:P3'],
      ['column', 'columnheader', 'Select column B', 'B1:B1001'],
      ['all', 'button', 'Select all cells', 'A1:P1001'],
    ] as const) {
      test(`${kind} header selects its complete extent at ${width}px`, async ({ page }) => {
        await page.getByRole(role, { name: label, exact: true }).click()
        await expect(name(page)).toHaveValue(address)
        await expect(cell(page, 2, 1)).toHaveAttribute('data-selected', 'true')
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      })
    }

    for (const [kind, role, start, end, address] of [
      ['row', 'button', 'Select row 3', 'Select row 5', 'A3:P5'],
      ['column', 'columnheader', 'Select column A', 'Select column B', 'A1:B1001'],
    ] as const) {
      test(`Shift ${kind} header extends the original axis selection at ${width}px`, async ({ page }) => {
        await page.getByRole(role, { name: start, exact: true }).click()
        await page.getByRole(role, { name: end, exact: true }).click({ modifiers: ['Shift'] })
        await expect(name(page)).toHaveValue(address)
        await expect(cell(page, 4, 1)).toHaveAttribute('data-selected', 'true')
      })
    }
  })
}
