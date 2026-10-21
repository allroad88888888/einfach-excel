import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const customers = ['Acme Co.', 'Northwind', 'Contoso', 'Globex', 'Initech', 'Umbrella']

for (const width of [1280, 390]) test.describe(`${width}px rendered page navigation`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B101', '100:1')
  })

  for (const [key, opposite, direction] of [
    ['PageDown', 'PageUp', 1], ['PageUp', 'PageDown', -1],
  ] as const) test(`grid ${key} moves exactly one rendered page at ${width}px`, async ({ page }) => {
    const scroll = page.getByTestId('sheet-scroll')
    const rowHeight = (await cell(page, '100:1').boundingBox())!.height
    const headerHeight = (await page.getByRole('button', {
      name: 'Select all cells', exact: true,
    }).boundingBox())!.height
    const pageRows = Math.max(1, Math.floor(
      ((await scroll.evaluate((node) => node.clientHeight)) - headerHeight) / rowHeight,
    ))
    const destination = 100 + direction * pageRows
    const grid = page.locator('[data-workbook-grid]')
    await grid.press(key)
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(`B${destination + 1}`)
    const target = cell(page, `${destination}:1`)
    await expect(target).toHaveAttribute('data-selected', 'true')
    await expect(target).toHaveText(customers[(destination - 1) % customers.length]!)
    await expect(target).toBeInViewport({ ratio: 1 })
    await expect(page.locator('td[data-selected="true"]')).toHaveCount(1)
    await expect(grid).toBeFocused()
    await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
    await grid.press(opposite)
    await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue('B101')
    await expect(cell(page, '100:1')).toHaveText('Globex')
    await expect(cell(page, '100:1')).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
    await select(page, 'A2', '1:0')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
    await expect(cell(page, '1:1')).toHaveText('Acme Co.')
    await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
  })
})
