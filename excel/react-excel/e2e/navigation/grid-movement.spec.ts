import { expect, test, type Page } from '@playwright/test'
import { select } from '../support/clipboard'

const cell = (page: Page, coord: string) => page.locator(`td[data-cell="${coord}"]`)
const moves = [
  { key: 'ArrowUp', address: 'B4', coord: '3:1', value: 'Contoso' },
  { key: 'ArrowDown', address: 'B6', coord: '5:1', value: 'Initech' },
  { key: 'ArrowLeft', address: 'A5', coord: '4:0', value: 'SO-10004' },
  { key: 'ArrowRight', address: 'C5', coord: '4:2', value: 'West' },
  { key: 'Enter', address: 'B6', coord: '5:1', value: 'Initech' },
  { key: 'Shift+Enter', address: 'B4', coord: '3:1', value: 'Contoso' },
  { key: 'Tab', address: 'C5', coord: '4:2', value: 'West' },
  { key: 'Shift+Tab', address: 'A5', coord: '4:0', value: 'SO-10004' },
  { key: 'Home', address: 'A5', coord: '4:0', value: 'SO-10004' },
  { key: 'End', address: 'B1001', coord: '1000:1', value: 'Globex' },
  { key: 'Control+Home', address: 'A1', coord: '0:0', value: 'Order' },
  { key: 'Meta+Home', address: 'A1', coord: '0:0', value: 'Order' },
  { key: 'Control+End', address: 'P1001', coord: '1000:15', value: '304.64' },
  { key: 'Meta+End', address: 'P1001', coord: '1000:15', value: '304.64' },
  { key: 'Control+ArrowUp', address: 'B1', coord: '0:1', value: 'Customer' },
  { key: 'Meta+ArrowUp', address: 'B1', coord: '0:1', value: 'Customer' },
  { key: 'Control+ArrowDown', address: 'B1001', coord: '1000:1', value: 'Globex' },
  { key: 'Meta+ArrowDown', address: 'B1001', coord: '1000:1', value: 'Globex' },
  { key: 'Control+ArrowLeft', address: 'A5', coord: '4:0', value: 'SO-10004' },
  { key: 'Meta+ArrowLeft', address: 'A5', coord: '4:0', value: 'SO-10004' },
  { key: 'Control+ArrowRight', address: 'P5', coord: '4:15', value: '80.92' },
  { key: 'Meta+ArrowRight', address: 'P5', coord: '4:15', value: '80.92' },
]

for (const width of [1280, 390]) test.describe(`${width}px ordinary grid navigation`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/e2e/fixtures/plain-sales-orders/')
    await expect(cell(page, '1:0')).toHaveText('SO-10001')
    await select(page, 'B5', '4:1')
  })

  for (const { key, address, coord, value } of moves)
    test(`grid ${key} selects exactly ${address} without editing at ${width}px`, async ({ page }) => {
      const grid = page.locator('[data-workbook-grid]')
      await grid.press(key)
      await expect(page.getByRole('textbox', { name: 'Name box' })).toHaveValue(address)
      await expect(cell(page, coord)).toHaveAttribute('data-selected', 'true')
      await expect(cell(page, coord)).toHaveText(value)
      await expect(cell(page, coord)).toBeInViewport({ ratio: 1 })
      await expect(page.locator('td[data-selected="true"]')).toHaveCount(1)
      await expect(grid).toBeFocused()
      await expect(page.getByRole('textbox', { name: 'Cell editor', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
      await select(page, 'B5', '4:1')
      await expect(cell(page, '4:1')).toHaveText('Globex')
      await select(page, 'A2', '1:0')
      await expect(cell(page, '1:0')).toHaveText('SO-10001')
      await expect(cell(page, '1:0')).toHaveCSS('font-weight', '700')
      await expect(cell(page, '1:1')).toHaveText('Acme Co.')
      await expect(cell(page, '1:1')).toHaveCSS('font-style', 'italic')
    })
})
