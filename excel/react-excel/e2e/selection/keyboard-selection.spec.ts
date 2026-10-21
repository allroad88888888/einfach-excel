import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const name = (page: Page) => page.getByRole('textbox', { name: 'Name box', exact: true })
const grid = (page: Page) => page.locator('[data-workbook-grid]')
const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)

for (const width of [1280, 390]) {
  test.describe(`${width}px keyboard selection`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 850 })
      await page.goto('/e2e/fixtures/plain-sales-orders/')
      await cell(page, '4:1').click()
    })

    for (const [key, opposite, address] of [
      ['ArrowUp', 'ArrowDown', 'B4:B5'], ['ArrowDown', 'ArrowUp', 'B5:B6'],
      ['ArrowLeft', 'ArrowRight', 'A5:B5'], ['ArrowRight', 'ArrowLeft', 'B5:C5'],
    ]) {
      test(`Shift ${key} extends and shrinks the original cell at ${width}px`, async ({ page }) => {
        await grid(page).press(`Shift+${key}`)
        await expect(name(page)).toHaveValue(address)
        await grid(page).press(`Shift+${opposite}`)
        await expect(name(page)).toHaveValue('B5')
        await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      })
    }

    for (const [key, opposite] of [['PageDown', 'PageUp'], ['PageUp', 'PageDown']]) {
      test(`Shift ${key} selects a page and returns to its anchor at ${width}px`, async ({ page }) => {
        await select(page, 'B101', '100:1')
        await grid(page).press(`Shift+${key}`)
        const address = await name(page).inputValue()
        const range = /^B(\d+):B(\d+)$/.exec(address)
        expect(range, address).not.toBeNull()
        if (key === 'PageDown') {
          expect(Number(range![1])).toBe(101)
          expect(Number(range![2])).toBeGreaterThan(101)
        } else {
          expect(Number(range![1])).toBeLessThan(101)
          expect(Number(range![2])).toBe(101)
        }
        await grid(page).press(`Shift+${opposite}`)
        await expect(name(page)).toHaveValue('B101')
      })
    }

    test(`Shift click after keyboard extension keeps the initial anchor at ${width}px`, async ({ page }) => {
      await grid(page).press('Shift+ArrowDown')
      await expect(name(page)).toHaveValue('B5:B6')
      await cell(page, '8:0').click({ modifiers: ['Shift'] })
      await expect(name(page)).toHaveValue('A5:B9')
    })
  })
}
